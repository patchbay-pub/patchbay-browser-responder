class Hoster {
  constructor(server, rootChannel, options) {
    this.server = server;
    this.rootChannel = rootChannel;

    this.files = {};

    let numWorkers = 4;
    if (options) {
      if (options && options.numWorkers) {
        numWorkers = options.numWorkers;
      }
    }

    for (let i = 0; i < numWorkers; i++) {
      this.hostFileWorker(i);
    }
  }

  async hostFile(file, path) {
    this.files[path] = file;
  }

  async hostFileWorker(workerId) {

    while (true) {

      const switchUrl = this.server + '/res' + this.rootChannel + '?switch=true';
      const randChan = randomChannelId();

      const response = await fetch(switchUrl, {
        method: 'POST',
        body: randChan,
      });

      //if (response.status < 200 || response.status > 299) {
      //  continue;
      //}

      let reqMethod;
      let reqPath;

      const reqHeaders = {};
      for (const entry of response.headers.entries()) {
        const headerName = entry[0];
        if (headerName === 'pb-method') {
          reqMethod = entry[1];
        }
        else if (headerName === 'pb-path') {
          reqPath = entry[1];
        }
        else if (headerName.startsWith('pb-h-')) {
          reqHeaders[headerName.slice('pb-h-'.length)] = entry[1];
        }
      }

      console.log(workerId, reqMethod, reqPath, reqHeaders);

      let sendFile = this.files[reqPath];

      const fileUrl = this.server + '/res/' + randChan;
      const resHeaders = {};

      if (!sendFile) {

        resHeaders['Pb-Status'] = '404';

        await fetch(fileUrl, {
          method: 'POST',
          body: "Not found",
          headers: resHeaders,
        });

        continue;
      }

      // TODO: parse byte range specs properly according to
      // https://tools.ietf.org/html/rfc7233
      if (reqHeaders.range) {

        const range = {};
        const right = reqHeaders.range.split('=')[1];
        const rangeParts = right.split('-');
        range.start = Number(rangeParts[0]);
        range.end = sendFile.size - 1;

        if (rangeParts[1]) {
          // Need to add one because HTTP ranges are inclusive
          range.end = Number(rangeParts[1]);
        }

        const originalSize = sendFile.size;

        console.log(sendFile.size, range);
        sendFile = sendFile.slice(range.start, range.end + 1);

        resHeaders['Pb-H-Content-Range'] = `bytes ${range.start}-${range.end}/${originalSize}`;
        resHeaders['Pb-H-Content-Length'] = range.end - range.start + 1;
        resHeaders['Pb-Status'] = '206';
      }
      else {
        resHeaders['Pb-H-Content-Length'] = `${sendFile.size}`;
      }

      resHeaders['Pb-H-Accept-Ranges'] = 'bytes';

      console.log(resHeaders);

      await new Promise((resolve, reject) => {

        const XHR_STATE_DONE = 4;

        const xhr = new XMLHttpRequest();
        xhr.open('POST', fileUrl + '?register-pulse=true');
        for (const header in resHeaders) {
          xhr.setRequestHeader(header, resHeaders[header]);
        }
        xhr.send(sendFile);

        fetch(fileUrl + '?check-pulse=true', {
          mode: 'no-cors',
        })
        .then(r => {
          console.log("request done");
          if (xhr.readyState !== XHR_STATE_DONE) {
            xhr.abort();
          }
          resolve();
        })
        .catch(e => {
          console.error(e);
        });
      });
    }
  }
}

function createHoster(server, rootChannel, options) {
  return new Hoster(server, rootChannel, options);
}

function randomChannelId() {
  const possible = "0123456789abcdefghijkmnpqrstuvwxyz";

  function genCluster() {
    let cluster = "";
    for (let i = 0; i < 32; i++) {
      const randIndex = Math.floor(Math.random() * possible.length);
      cluster += possible[randIndex];
    }
    return cluster;
  }

  let id = "";
  id += genCluster();
  //id += '-';
  //id += genCluster();
  //id += '-';
  //id += genCluster();
  return id;
}

export {
  createHoster,
};

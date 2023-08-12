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

      const randChan = genRandomKey(32);
      // TODO: test the following CORS mitigation technique. Seems risky. I
      // think if requests are canceled you might end up getting the wrong
      // response.
      //const randChan = this.rootChannel + '-worker' + workerId;
      const switchUrl = this.server + '/' + this.rootChannel + `?responder=true&switch_to=${randChan}`;

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

      const filePath = reqPath.slice(('/' + this.rootChannel).length);
      let sendFile = this.files[filePath];


      const fileUrl = new URL(randChan, this.server);
      fileUrl.searchParams.append('responder', true);

      if (!sendFile) {

        fileUrl.searchParams.append('pb-status', 404);

        await fetch(fileUrl, {
          method: 'POST',
          body: "Not found",
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

        sendFile = sendFile.slice(range.start, range.end + 1);

        fileUrl.searchParams.append('pb-h-content-range', `bytes ${range.start}-${range.end}/${originalSize}`);
        fileUrl.searchParams.append('pb-h-content-length', range.end - range.start + 1);
        fileUrl.searchParams.append('pb-status', 206);
      }
      else {
        fileUrl.searchParams.append('pb-h-content-length', `${sendFile.size}`);
      }

      fileUrl.searchParams.append('pb-h-accept-ranges', 'bytes');

      await fetch(fileUrl, {
        method: 'POST',
        body: sendFile,
      });
    }
  }
}

function createHoster(server, rootChannel, options) {
  return new Hoster(server, rootChannel, options);
}

function genRandomKey(len) {
  const possible = "0123456789abcdefghijkmnpqrstuvwxyz";

  function genCluster() {
    let cluster = "";
    for (let i = 0; i < len; i++) {
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
  genRandomKey,
};

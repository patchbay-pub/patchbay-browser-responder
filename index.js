class Hoster {
  constructor(server, rootChannel) {
    this.server = server;
    this.rootChannel = rootChannel;

    this.files = {};

    for (let i = 0; i < 1; i++) {
      this.hostFileWorker(i);
    }
  }

  async hostFile(file, path) {
    this.files[path] = file;
  }

  async hostFileWorker(workerId) {

    console.log(`Starting worker ${workerId}`);

    while (true) {

      const switchUrl = this.server + '/res' + this.rootChannel + '?switch=true';
      const randChan = randomChannelId();

      const response = await fetch(switchUrl, {
        method: 'POST',
        body: randChan,
      });

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

      const path = reqPath.slice(this.rootChannel.length);
      console.log(reqMethod, reqPath, path, reqHeaders);

      let sendFile = this.files[path];

      const fileUrl = this.server + '/res/' + randChan;
      const resHeaders = {};

      if (!sendFile) {

        resHeaders['Pb-Status'] = '404';

        console.error("404");
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

        sendFile = sendFile.slice(range.start, range.end + 1);

        resHeaders['Pb-Content-Range'] = `bytes ${range.start}-${range.end}/${originalSize}`;
        resHeaders['Pb-Status'] = '206';
      }

      resHeaders['Pb-Accept-Ranges'] = 'bytes';
      resHeaders['Pb-Content-Length'] = `${sendFile.size}`;

      const fileResponse = await fetch(fileUrl, {
        method: 'POST',
        body: sendFile,
        headers: resHeaders,
      });

      console.log(`${switchUrl} served from worker ${workerId}`);

      const text = await fileResponse.text();
    }
  }
}

function createHoster(server, rootChannel) {
  return new Hoster(server, rootChannel);
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

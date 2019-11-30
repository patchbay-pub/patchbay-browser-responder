const requestPrefix = 'pb-req-';
const responsePrefix = 'pb-res-';

class Hoster {
  constructor(server, rootChannel) {
    this.server = server;
    this.rootChannel = rootChannel;
  }

  async hostFile(file, path) {
    for (let i = 0; i < 4; i++) {
      this.hostFileWorker(file, path, i);
    }
  }

  async hostFileWorker(file, path, workerId) {

    console.log(`Starting worker ${workerId} for ${path}`);

    while (true) {

      const switchUrl = this.server + this.rootChannel + path + '?responder=true&switch=true';
      const randChan = randomChannelId();

      const response = await fetch(switchUrl, {
        method: 'POST',
        body: randChan,
      });

      const reqHeaders = {};
      for (const entry of response.headers.entries()) {
        const headerName = entry[0];
        if (headerName.startsWith(requestPrefix)) {
          reqHeaders[headerName.slice(requestPrefix.length)] = entry[1];
        }
      }

      console.log(reqHeaders);

      let sendFile = file;

      const resHeaders = {};

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

        console.log(range);

        const originalSize = sendFile.size;

        sendFile = sendFile.slice(range.start, range.end + 1);

        resHeaders[responsePrefix + 'Content-Range'] = `bytes ${range.start}-${range.end}/${originalSize}`;
        resHeaders['Pb-Status'] = '206';
      }

      resHeaders[responsePrefix + 'Accept-Ranges'] = 'bytes';
      resHeaders[responsePrefix + 'Content-Length'] = `${sendFile.size}`;

      const fileUrl = this.server + '/' + randChan + '?responder=true';
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

(function () {
  var host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    window.HP_API_URL = 'http://localhost:1337';
  } else {
    window.HP_API_URL = '';
  }
})();
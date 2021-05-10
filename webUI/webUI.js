const express = require('express');
const bodyParser = require("body-parser");
const path = require('path');
const app = express();
const { bindRoute } = require('./bindRoute');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/', express.static(path.join(__dirname, './dist')));
app.set('port', process.env.PORT || 3003);

bindRoute(app, express).listen(app.get('port'), async function () {
  console.log('JdWebUI listening on http://localhost:' + app.get('port'));
});
const path = require('path');
var bindRoute = (app, express) => {
  app.all('/api/:module/:action', async function (req, res) {
    console.time('usedTime')
    let ctls = [req.params.module, req.params.action]
    try {
      await require(path.join(...[__dirname, 'modules'].concat(ctls))).default(req, res);
    } catch (err) {
      console.log(err)
      res.end(JSON.stringify({
        code: 1,
        msg: err.message
      }))
    }
    console.timeEnd('usedTime')
  })
  return app
}
exports.bindRoute = bindRoute
const path = require('path')
const fs = require('fs-extra')
const { buildArgs } = require('../../../utils/util')

var action = async (req, res) => {
  let config_dir = path.join(process.env.asm_save_data_dir, 'config')

  var list = [];
  var listFile = function (dir) {
    var arr = fs.readdirSync(dir);
    arr.forEach(function (item) {
      var fullpath = path.join(dir, item);
      var stats = fs.statSync(fullpath);
      if (stats.isDirectory()) {
        listFile(fullpath);
      } else {
        list.push(fullpath);
      }
    });
  }

  if (fs.existsSync(config_dir)) {
    listFile(config_dir)
  }

  let result = []

  for (let file of list) {
    let type = path.basename(file).replace('.json', '')
    let json_data = fs.readJSONSync(file)
    let accounts = buildArgs(json_data)
    for (let account of accounts) {
      for (let key in account) {
        if ([
          'notify_pushplus_token',
          'notify_sckey',
          'notify_wechat_corpid',
          'notify_wechat_corpsecret',
          'notify_wechat_agentld',
          'notify_tele_bottoken',
          'notify_tele_chatid',
          'notify_tele_url'
        ].indexOf(key) !== -1) {
          delete account[key]
        }
      }
      result.push({
        user: account.user || account.username,
        name: account.name,
        sn: account.accountSn,
        type: type,
        config: JSON.stringify(account)
      })
    }
  }
  res.end(JSON.stringify({
    Code: 200,
    Data: result,
    Msg: 'success'
  }))
}
exports.default = action
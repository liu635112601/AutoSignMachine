const os = require('os')
const path = require('path')
const fs = require('fs-extra')

var fmtArgs = (k, v) => {
    if (['user', 'username', 'password'].indexOf(k) !== -1) {
        return v + ''
    }
    return v
}
module.exports = {
    async delCookiesFile (key) {
        let dir = process.env.asm_save_data_dir
        if (!fs.existsSync(dir)) {
            fs.mkdirpSync(dir)
        }
        let cookieFile = path.join(dir, 'cookieFile_' + key + '.txt')
        if (fs.existsSync(cookieFile)) {
            fs.unlinkSync(cookieFile)
        }
    },
    getCookies: (key) => {
        let dir = process.env.asm_save_data_dir
        if (!fs.existsSync(dir)) {
            fs.mkdirpSync(dir)
        }
        let cookieFile = path.join(dir, 'cookieFile_' + key + '.txt')
        if (fs.existsSync(cookieFile)) {
            let cookies = fs.readFileSync(cookieFile).toString('utf-8')
            return cookies
        }
        return ''
    },
    saveCookies: (key, cookies, cookiesJar) => {
        let dir = process.env.asm_save_data_dir
        if (!fs.existsSync(dir)) {
            fs.mkdirpSync(dir)
        }
        let cookieFile = path.join(dir, 'cookieFile_' + key + '.txt')
        let allcookies = {}
        if (cookies) {
            cookies.split('; ').map(c => {
                let item = c.split('=')
                allcookies[item[0]] = item[1] || ''
            })
        }
        if (cookiesJar) {
            cookiesJar.toJSON().cookies.map(c => {
                allcookies[c.key] = c.value || ''
            })
        }
        let cc = []
        for (let key in allcookies) {
            cc.push({
                key: key,
                value: allcookies[key] || ''
            })
        }
        fs.ensureFileSync(cookieFile)
        fs.writeFileSync(cookieFile, cc.map(c => c.key + '=' + c.value).join('; ')
        )
    },
    buildArgs: (argv) => {
        var accounts = []
        var arg_group = {}
        for (let arg_k in argv) {
            let arg = argv[arg_k]
            if (arg_k.indexOf('-') !== -1) {
                let arg_k_split = arg_k.split('-')
                let t = arg_k_split.pop()
                let isN = (typeof t === 'number' || /^\d+$/.test(t))
                if (!(t in arg_group) && isN) {
                    arg_group[t] = {}
                }
                if (isN) {
                    arg_group[t][arg_k_split.join('-')] = fmtArgs(arg_k_split.join('-'), arg)
                } else {
                    if (!('0' in arg_group)) {
                        arg_group['0'] = {}
                    }
                    arg_group['0'][arg_k] = fmtArgs(arg_k, arg)
                }
            } else {
                if (!('0' in arg_group)) {
                    arg_group['0'] = {}
                }
                arg_group['0'][arg_k] = fmtArgs(arg_k, arg)
            }
        }
        if ('accountSn' in argv && argv.accountSn) {
            let accountSns = (argv.accountSn + '').split(',')
            for (let sn of accountSns) {
                let account = {
                    accountSn: sn,
                    ...((sn in arg_group) ? arg_group[sn] : {})
                }
                if (('tryrun-' + sn) in argv) {
                    account['tryrun'] = true
                }
                if (argv['tasks-' + sn] || argv['tasks'] || '') {
                    account['tasks'] = argv['tasks-' + sn] || argv['tasks'] || ''
                }
                accounts.push({
                    ...arg_group['0'],
                    ...account
                })
            }
        } else {
            let account = {
                accountSn: 1,
                ...arg_group['0']
            }
            if (argv['tasks'] || '') {
                account['tasks'] = argv['tasks'] || ''
            }
            accounts.push(account)
        }
        return accounts
    },
    parseCookie: (cookies, keys) => {
        let allcookies = {}
        cookies.split('; ').map(c => {
            let item = c.split('=')
            allcookies[item[0]] = item[1] || ''
        })
        let result = {}
        for (let key of keys) {
            result[key] = decodeURIComponent(allcookies[key]) || ''
        }
        return result
    },
    ExecCommand: async (command, params, options, callback) => {
        let scheduler = await require(path.join('../commands', 'tasks', command, command)).start({
            cookies: params.options.cookies,
            options: params.options.account
        }).catch(err => console.error(err))
        await scheduler.execTask(command, {
            ...params.options.account,
            taskKey: params.taskKey
        }, options).catch(err => console.error(err)).finally(() => {
            if (callback) {
                callback(scheduler)
            }
            console.info('当前任务执行完毕！')
        })
    }
}
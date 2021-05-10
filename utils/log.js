const util = require('util')
const axios = require('axios');
const fs = require('fs-extra');
var transParams = (data) => {
    let params = new URLSearchParams();
    for (let item in data) {
        params.append(item, data['' + item + '']);
    }
    return params;
};

var notify_logs = {}

function isInteger (obj) {
    return typeof obj === 'number' && obj % 1 === 0
}
var notify = {
    dingtalk_send: async (desp) => {
        if (desp.length) {
            console.log('使用dingtalk机器人推送消息')
            await axios({
                url: `https://oapi.dingtalk.com/robot/send?access_token=${process.env.notify_dingtalk_token}`,
                method: 'post',
                data: {
                    "msgtype": "text",
                    "text": {
                        content: desp
                    },
                }
            }).catch(err => console.log('发送失败'))
        }
    },
    tele_send: async (desp) => {
        if (desp.length) {
            console.log('使用tele机器人推送消息')
            await axios({
                url: `${process.env.notify_tele_url}/bot${process.env.notify_tele_bottoken}/`,
                method: 'post',
                data: {
                    "method": "sendMessage",
                    "chat_id": process.env.notify_tele_chatid,
                    "text": desp,
                }
            }).catch(err => console.log('发送失败'))
        }
    },
    sct_send: async (desp) => {
        if (desp.length) {
            console.log('使用Server酱推送消息')
            await axios({
                url: `https://sctapi.ftqq.com/${process.env.notify_sctkey}.send`,
                method: 'post',
                params: transParams({
                    text: 'ASM任务消息',
                    desp
                })
            }).catch(err => console.log('发送失败'))
        }
    },
    sc_send: async (desp) => {
        if (desp.length) {
            console.log('使用Server酱推送消息')
            await axios({
                url: `https://sc.ftqq.com/${process.env.notify_sckey}.send`,
                method: 'post',
                params: transParams({
                    text: 'ASM任务消息',
                    desp
                })
            }).catch(err => console.log('发送失败'))
        }
    },
    pushplus_send: async (desp) => {
        if (desp.length) {
            console.log('使用pushplus酱推送消息')
            await axios({
                url: `http://www.pushplus.plus/send`,
                method: 'post',
                data: {
                    token: process.env.notify_pushplus_token,
                    title: 'ASM任务消息',
                    content: desp
                }
            }).catch(err => console.log('发送失败'))
        }
    },
    corp_wechat_send: async (desp) => {
        if (desp.length) {
            console.log('使用企业微信推送消息')
            let { data:
                {
                    access_token
                }
            } = await axios({
                headers: {
                    "Content-Type": 'application/json'
                },
                url: `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${process.env.notify_wechat_corpid}&corpsecret=${process.env.notify_wechat_corpsecret}`,
                method: 'get'
            })
            await axios({
                url: `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${access_token}`,
                method: 'post',
                data: {
                    "touser": "@all",
                    "msgtype": "text",
                    "agentid": process.env.notify_wechat_agentld,
                    "text": { "content": desp }
                }
            }).catch(err => console.log('发送失败'))
        }
    },
    corp_wechat_bot_send: async (desp) => {
        if (desp.length) {
            console.log('使用企业微信群机器人推送消息')
            await axios({
                url: `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${process.env.notify_wechat_bottoken}`,
                method: 'post',
                data: {
                    "msgtype": "text",
                    "text": { "content": desp }
                }
            }).catch(err => console.log('发送失败'))
        }
    },
    buildMsg: () => {
        let msg = ''
        for (let taskName in notify_logs) {
            msg += `**以下为${taskName}任务消息**\n\n`
            msg += notify_logs[taskName].join('\n')
        }
        return msg
    },
    sendLog: async () => {
        if (process.env.notify_sctkey) {
            notify.sct_send(notify.buildMsg())
        }
        if (process.env.notify_sckey) {
            notify.sc_send(notify.buildMsg())
        }
        if (process.env.notify_tele_bottoken && process.env.notify_tele_chatid) {
            notify.tele_send(notify.buildMsg())
        }
        if (process.env.notify_dingtalk_token) {
            notify.dingtalk_send(notify.buildMsg())
        }
        if (process.env.notify_pushplus_token) {
            notify.pushplus_send(notify.buildMsg())
        }
        if (process.env.notify_wechat_corpid && process.env.notify_wechat_corpsecret && process.env.notify_wechat_agentld) {
            notify.corp_wechat_send(notify.buildMsg())
        }
        if (process.env.notify_wechat_bottoken) {
            notify.corp_wechat_bot_send(notify.buildMsg())
        }

        notify_logs = {}
    }
}

var wrapper_color = (type, msg) => {
    if (process.stdout.isTTY) {
        if (type === 'error') {
            msg = `\x1B[31m${msg}\x1B[0m`
        } else if (type === 'reward') {
            msg = `\x1B[36m${msg}\x1B[0m`
        }
    }
    if (type === 'error') {
        msg = '[❌🤣🌋] ' + msg
    } else if (type === 'reward') {
        msg = '[✅🤩🍗] ' + msg
    }
    return msg
}
var stdout_task_msg = (task, msg) => {
    if (task.taskName) {
        msg = `${task.taskName}: ` + msg
    }
    process.stdout.write(msg + '\n')
}

console.sendLog = notify.sendLog
module.exports = {
    notify,
    logbuild (task) {
        var log = {}
        log.notify = function () {
            if (task.taskName) {
                if (!(task.taskName in notify_logs)) {
                    notify_logs[task.taskName] = []
                }
                notify_logs[task.taskName].push(util.format.apply(null, arguments) + '\n')
            }
            stdout_task_msg(task, util.format.apply(null, arguments))
        }

        log.log = function () {
            if (process.env.asm_verbose === 'true') {
                stdout_task_msg(task, util.format.apply(null, arguments))
            }
        }

        log.info = function () {
            stdout_task_msg(task, util.format.apply(null, arguments))
        }

        log.error = function () {
            stdout_task_msg(task, wrapper_color('error', util.format.apply(null, arguments)))
        }

        log.reward = function () {
            let type, num
            if (arguments.length === 2) {
                type = arguments[0]
                num = arguments[1]
            } else if (arguments.length === 1) {
                type = arguments[0]
                num = 1

                if (arguments[0].indexOf('奖励积分') !== -1) {
                    type = 'integral'
                    num = parseFloat(arguments[0])
                }
                if (arguments[0].indexOf('通信积分') !== -1) {
                    type = 'txintegral'
                    num = parseFloat(arguments[0])
                }
                if (arguments[0].indexOf('定向积分') !== -1) {
                    type = 'dxintegral'
                    num = parseFloat(arguments[0])
                }
            }

            stdout_task_msg(task, wrapper_color('reward', util.format.apply(null, [type, num])))

            let taskJson = fs.readFileSync(process.env.taskfile).toString('utf-8')
            taskJson = JSON.parse(taskJson)
            if (!('rewards' in taskJson)) {
                taskJson['rewards'] = {}
            }
            let rewards = taskJson.rewards
            let n = parseFloat(num || 0)
            if (!(type in rewards)) {
                rewards[type] = n
            } else {
                let t = parseFloat(rewards[type]) + n
                rewards[type] = isInteger(t) ? t : new Number(t).toFixed(2)
            }
            taskJson['rewards'] = rewards

            fs.writeFileSync(process.env.taskfile, JSON.stringify(taskJson))
        }
        return log
    }
}
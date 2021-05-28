const os = require('os')
const path = require('path')
const fs = require('fs-extra')
var moment = require('moment');
const { Worker } = require('worker_threads')
moment.locale('zh-cn');
const { getCookies, saveCookies, delCookiesFile } = require('./util')
const { TryNextItem, StopTask, CompleteTask } = require('./EnumError')
const _request = require('./request')
const { logbuild } = require('../utils/log')
var crypto = require('crypto');
const { default: PQueue } = require('p-queue');

const randomDate = (options) => {
    let startDate = moment();
    let endDate = moment().endOf('days').subtract(3, 'hours');

    let defaltMinStartDate = moment().startOf('days').add('4', 'hours')
    if (startDate.isBefore(defaltMinStartDate, 'minutes')) {
        startDate = defaltMinStartDate
    }

    if (options && typeof options.startHours === 'number') {
        startDate = moment().startOf('days').add(options.startHours, 'hours')
    }
    if (options && typeof options.endHours === 'number') {
        endDate = moment().startOf('days').add(options.endHours, 'hours')
    }

    return new Date(+startDate.toDate() + Math.random() * (endDate.toDate() - startDate.toDate()));
};

let tasks = {}
let scheduler = {
    taskFile: path.join(os.homedir(), '.AutoSignMachine', 'taskFile.json'),
    today: '',
    isRunning: false,
    isTryRun: false,
    taskJson: undefined,
    queues: [],
    will_tasks: [],
    selectedTasks: [],
    taskKey: 'default',
    clean: async () => {
        scheduler.today = '';
        scheduler.isRunning = false;
        scheduler.isTryRun = false;
        scheduler.taskJson = undefined;
        scheduler.queues = [];
        scheduler.will_tasks = [];
        scheduler.selectedTasks = [];
        scheduler.taskKey = 'default';
    },
    updateTaskFile: (task, newTask, checkRun = false) => {
        let taskJson = fs.readFileSync(process.env.taskfile).toString('utf-8')
        taskJson = JSON.parse(taskJson)
        let taskindex = taskJson.queues.findIndex(q => q.taskName === task.taskName)
        if (taskindex !== -1) {
            if (checkRun && taskJson.queues[taskindex].isRunning) {
                return true
            }
            taskJson.queues[taskindex] = {
                ...taskJson.queues[taskindex],
                ...newTask
            }
        }
        scheduler.taskJson = taskJson
        fs.writeFileSync(scheduler.taskFile, JSON.stringify(scheduler.taskJson))
    },
    buildQueues: async (taskNames, queues) => {
        for (let taskName of taskNames) {
            let OgnOptions = tasks[taskName].options || {}
            let replayoptions = tasks[taskName].replayoptions || []
            if (!replayoptions.length) {
                replayoptions = [OgnOptions]
            }
            let isn = replayoptions.length > 1
            let n = 0
            for (let replay of replayoptions) {
                let mergeOptions = Object.assign({}, OgnOptions, replay)
                let willTime = moment(randomDate(mergeOptions));
                let waitTime = Math.floor(Math.random() * 120 + 10);
                if (mergeOptions) {
                    if (mergeOptions.isCircle || mergeOptions.dev) {
                        willTime = moment().startOf('days');
                    }
                    if (typeof mergeOptions.startTime === 'number') {
                        willTime = moment().startOf('days').add(mergeOptions.startTime, 'seconds');
                    }
                    if (mergeOptions.ignoreRelay) {
                        waitTime = 0;
                    }
                }
                if (scheduler.isTryRun) {
                    // tryRun模式忽略执行延迟
                    willTime = moment().startOf('days');
                    waitTime = 0;
                }
                let sn = (isn ? ('-' + (++n)) : '')
                queues.push({
                    taskName: taskName + sn,
                    taskSn: sn,
                    taskState: 0,
                    willTime: willTime.format('YYYY-MM-DD HH:mm:ss'),
                    waitTime: waitTime,
                    ignore: mergeOptions.ignore,
                    immediate: mergeOptions.immediate
                })
                tasks[taskName + sn] = {
                    callback: tasks[taskName].callback,
                    options: tasks[taskName].options
                }
            }
        }
        return queues
    },
    OgnName(task) {
        return task.taskName.replace(task.taskSn || '', '')
    },
    getSomeNewTaskNames: (existsTasks, newAllTaskNames) => {
        let existsTaskNames = existsTasks.map(t => t.taskName)
        let notExistsTaskNames = newAllTaskNames.filter(n => existsTaskNames.indexOf(n) === -1)
        return notExistsTaskNames
    },
    initTasksQueue: async () => {
        const today = moment().format('YYYYMMDD')
        if (!fs.existsSync(scheduler.taskFile) || scheduler.isTryRun) {
            console.info('初始化配置中')
            let queues = await scheduler.buildQueues(Object.keys(tasks), [])
            fs.ensureFileSync(scheduler.taskFile)
            fs.writeFileSync(scheduler.taskFile, JSON.stringify({
                today,
                queues
            }))
        } else {
            let taskJson = fs.readFileSync(scheduler.taskFile).toString('utf-8')
            taskJson = JSON.parse(taskJson)
            if (taskJson.today !== today) {
                console.info('日期已变更，重新生成任务配置')
                let queues = await scheduler.buildQueues(Object.keys(tasks), [])
                fs.writeFileSync(scheduler.taskFile, JSON.stringify({
                    ...taskJson,
                    rewards: {},
                    today,
                    queues
                }))
            } else if (taskJson.queues.length != Object.keys(tasks).length) {
                let OldNames = new Set(taskJson.queues.map(q => scheduler.OgnName(q)))
                let OtherNames = Object.keys(tasks).filter(name => !OldNames.has(name))
                if (OtherNames.length) {
                    console.info('增加新的任务配置')
                    let queues = await scheduler.buildQueues(
                        OtherNames,
                        taskJson.queues || []
                    )
                    fs.writeFileSync(scheduler.taskFile, JSON.stringify({
                        ...taskJson,
                        today,
                        queues
                    }))
                }
            }
        }
        scheduler.today = today
    },
    genFileName(command) {
        if (process.env.asm_func === 'true') {
            // 暂不支持持久化配置，使用一次性执行机制，函数超时时间受functions.timeout影响
            scheduler.isTryRun = true
        }
        let dir = process.env.asm_save_data_dir
        if (!fs.existsSync(dir)) {
            fs.mkdirpSync(dir)
        }
        scheduler.taskFile = path.join(dir, `taskFile_${command}_${scheduler.taskKey}.json`)
        process.env['taskfile'] = scheduler.taskFile
        scheduler.today = moment().format('YYYYMMDD')
        let maskFile = path.join(dir, `taskFile_${command}_${scheduler.taskKey.replaceWithMask(2, scheduler.isTryRun ? 10 : 3)}.json`)
        console.info('获得配置文件', maskFile, '当前日期', scheduler.today)
    },
    loadTasksQueue: async (selectedTasks) => {
        let queues = []
        let will_tasks = []
        let taskJson = {}
        if (fs.existsSync(scheduler.taskFile)) {
            taskJson = fs.readFileSync(scheduler.taskFile).toString('utf-8')
            taskJson = JSON.parse(taskJson)
            if (taskJson.today === scheduler.today) {
                if (scheduler.isTryRun) {
                    queues = taskJson.queues
                } else {
                    queues = taskJson.queues.filter(t =>
                        (!t.ignore) && (
                            // 未处于运行状态
                            (!t.isRunning) ||
                            // 处于运行状态且超过了运行截止时间
                            (t.isRunning && t.runStopTime && moment(t.runStopTime).isBefore(moment(), 'minutes'))
                        )
                    )
                    if (taskJson.queues.length !== queues.length) {
                        let ingoreTasks = taskJson.queues.filter(t =>
                            (!t.ignore) && (
                                // 处于运行状态未设置截止时间
                                (t.isRunning && !t.runStopTime) ||
                                // 处于运行状态且还未到运行截止时间
                                (t.isRunning && t.runStopTime && moment(t.runStopTime).isAfter(moment(), 'minutes'))
                            )
                        ).map(t => t.taskName)
                        if (ingoreTasks.length > 0) {
                            console.info('跳过以下正在执行的任务', ingoreTasks.join(','))
                        }
                    }
                }
            } else {
                console.info('日期配置已失效')
            }
        } else {
            console.info('配置文件不存在')
        }

        if (Object.prototype.toString.call(selectedTasks) == '[object String]') {
            selectedTasks = selectedTasks.split(',').filter(q => q)
        } else {
            selectedTasks = []
        }

        if (scheduler.isTryRun) {
            will_tasks = queues.filter(task => (!selectedTasks.length || selectedTasks.length && selectedTasks.indexOf(scheduler.OgnName(task)) !== -1) && (!task.taskSn || task.taskSn == '-1'))
        } else {
            will_tasks = queues.filter(task =>
                scheduler.OgnName(task) in tasks &&
                task.taskState === 0 &&
                moment(task.willTime).isBefore(moment(), 'seconds') &&
                (!selectedTasks.length || selectedTasks.length && selectedTasks.indexOf(scheduler.OgnName(task)) !== -1)
            )
        }

        scheduler.taskJson = taskJson
        scheduler.queues = queues
        scheduler.will_tasks = will_tasks.sort((a, b) => {
            return a.waitTime - b.waitTime;
        })
        scheduler.selectedTasks = selectedTasks
        console.info('计算可执行任务', '总任务数', taskJson.queues.length, '已完成任务数', queues.filter(t => t.taskState === 1).length, '错误任务数', queues.filter(t => t.taskState === 2 && !t.ignore).length, '指定任务数', selectedTasks.length, '预计可执行任务数', will_tasks.length, '处于忽略状态任务', taskJson.queues.filter(t => !!t.ignore).length)
        return {
            taskJson,
            queues,
            will_tasks
        }
    },
    regTask: async (taskName, callback, options, replayoptions) => {
        tasks[taskName] = {
            callback,
            options,
            replayoptions
        }
    },
    regTask2: async (taskName, callback, options, replayoptions) => {
        tasks[taskName] = {
            callback,
            options,
            replayoptions
        }
    },
    completeTask: (err, task, logger) => {
        var buildNextTime = (eventData, task, newTask) => {
            let ttt = tasks[scheduler.OgnName(task)] || {}
            if (eventData.relayTime) {
                newTask.willTime = moment().add(eventData.relayTime, 'seconds').format('YYYY-MM-DD HH:mm:ss')
            } else if (ttt.options?.intervalTime) {
                newTask.willTime = moment().add(ttt.options?.intervalTime, 'seconds').format('YYYY-MM-DD HH:mm:ss')
            } else if (ttt.options?.intervalHours) {
                newTask.willTime = moment().add(ttt.options?.intervalHours, 'hours').format('YYYY-MM-DD HH:mm:ss')
            } else {
                newTask.willTime = moment().add(10, 'minutes').format('YYYY-MM-DD HH:mm:ss')
            }
            if (ttt.options?.isCircle) {
                newTask.taskState = 0
            } else {
                newTask.taskState = 1
            }
            return newTask
        }
        if (err instanceof TryNextItem) {
            let eventData = JSON.parse(err.message)
            logger.error(eventData.message || '执行结束')
            return {
                ...buildNextTime(eventData, task, {
                    failNum: 0
                }),
                taskState: 0
            }
        } else if (err instanceof CompleteTask) {
            logger.info(err.message || '执行结束')
            return buildNextTime({}, task, {
                failNum: 0
            })
        } else if (err instanceof StopTask) {
            logger.info(err.message || '执行结束')
            return {
                ...buildNextTime({}, task, {
                    failNum: 0
                }),
                taskState: 1
            }
        } else {
            logger.info('任务错误：', err)
            if (task.failNum > 3) {
                logger.notify('任务错误次数过多，停止该任务后续执行')
                return {
                    taskState: 2,
                    taskRemark: `错误过多停止(fail:${task.failNum})`,
                    failNum: 0
                }
            } else {
                return {
                    taskState: 0,
                    failNum: task.failNum ? (parseInt(task.failNum) + 1) : 1
                }
            }
        }
    },
    buildEnvTask: async (command, task, init_funcs_result) => {

        let logger = task.logger
        let st = new Date().getTime();
        let newTask = {}
        try {
            logger.info('开始执行', task.taskName)

            let isrun = scheduler.updateTaskFile(task, {
                // 限制执行时长2hours，runStopTime用于防止因意外原因导致isRunning=true的任务被中断，而未改变状态使得无法再次执行的问题
                runStopTime: moment().add(2, 'hours').format('YYYY-MM-DD HH:mm:ss'),
                isRunning: true
            }, true)

            if (isrun) {
                throw new TryNextItem(JSON.stringify({
                    message: `已经在运行了,跳过本次运行`,
                    relayTime: 600
                }))
            }

            let init_result = init_funcs_result[scheduler.OgnName(task) + '_init']
            if (task.waitTime) {
                logger.info('延迟执行', task.taskName, task.waitTime, 'seconds')
                await new Promise((resolve, reject) => setTimeout(resolve, task.waitTime * 1000))
            }
            let ttt = tasks[scheduler.OgnName(task)] || {}
            if (Object.prototype.toString.call(ttt.callback) === '[object String]') {
                ttt.callback = [ttt.callback, 'doTask']
            }
            if (Object.prototype.toString.call(ttt.callback) === '[object Object]') {
                ttt.callback = [ttt.callback.path, ttt.callback.method]
            }
            if (Object.prototype.toString.call(ttt.callback) === '[object Array]') {
                if (ttt.options.init) {
                    delete ttt.options.init
                }
                await new Promise((resolve, reject) => {
                    let worker = new Worker(path.join(__dirname, 'taskActuator.js'), {
                        workerData: {
                            task: {
                                ...task,
                                ...ttt
                            },
                            argvs: scheduler.account,
                            cookies: init_result.cookies
                        }
                    })
                    worker.on('message', (msg) => {
                        let message = JSON.parse(msg)
                        if (message.type === 'TryNextItem') {
                            reject(new TryNextItem(message.data))
                        } else if (message.type === 'StopTask') {
                            reject(new StopTask(message.data))
                        } else if (message.type === 'CompleteTask') {
                            reject(new CompleteTask())
                        } else {
                            reject(new Error(message.data))
                        }
                    })
                    worker.on('exit', resolve)
                })
            } else if (Object.prototype.toString.call(ttt.callback) === '[object AsyncFunction]') {
                await ttt.callback.apply(this, [{
                    ...init_result.request,
                    logger
                }])
                throw new CompleteTask()
            } else {
                throw new StopTask('任务执行内容空')
            }
        } catch (err) {
            newTask = scheduler.completeTask(err, task, logger)
        }
        finally {
            let time = new Date().getTime() - st;
            logger.info('执行用时', Math.floor(time / 1000), '秒')
            scheduler.updateTaskFile(task, {
                ...newTask,
                isRunning: false,
                time
            })
        }
    },
    buildExecQueue: async (command, will_tasks, concurrency, init_funcs_result) => {
        // 任务执行
        let queue = new PQueue({ concurrency });
        if (will_tasks.length) {
            console.info('调度任务中', '并发数', concurrency)
        }
        for (let task of will_tasks) {
            queue.add(async () => await scheduler.buildEnvTask(command, task, init_funcs_result))
        }
        await queue.onIdle()
    },
    execInitFunc: async (command, will_tasks) => {
        let init_funcs = {}
        let init_funcs_result = {}
        let tasks_result = []
        for (let task of will_tasks) {
            let ttt = tasks[scheduler.OgnName(task)] || {}
            let tttOptions = ttt.options || {}
            let savedCookies = await getCookies([command, scheduler.taskKey].join('_')) || tttOptions.cookies
            let logger = {
                ...console, ...logbuild([
                    command,
                    task.taskName,
                    scheduler.taskKey.replace('_tryrun', '').replaceWithMask(2, 3)
                ])
            }
            let request = {
                ..._request(savedCookies),
                logger
            }
            let init_key = scheduler.OgnName(task) + '_init'
            if (tttOptions.init) {
                if (Object.prototype.toString.call(tttOptions.init) === '[object AsyncFunction]') {
                    let hash = crypto.createHash('md5').update(tttOptions.init.toString()).digest('hex')
                    let init_result = false
                    if (!(hash in init_funcs)) {
                        init_result = await tttOptions['init'](request, savedCookies)
                        if (init_result !== false) {
                            init_funcs_result[init_key] = {
                                cookies: savedCookies,
                                ...init_result
                            }
                        } else {
                            init_funcs_result[init_key] = false
                        }
                        init_funcs[hash] = init_key
                    } else {
                        init_funcs_result[init_key] = init_funcs_result[init_funcs[hash]]
                    }

                    if (init_funcs_result[init_key] !== false) {
                        tasks_result.push({
                            ...task,
                            logger
                        })
                    } else {
                        logger.info('初始化条件失败，跳过执行', task.taskName)
                    }
                } else {
                    logger.info('不支持的初始化参数', task.taskName)
                }
            } else {
                init_funcs_result[init_key] = { request, cookies: savedCookies }
            }
        }

        return { tasks_result, init_funcs_result }
    },
    execTask: async (command, account, options) => {

        console.info('开始执行任务')

        scheduler.clean()
        scheduler.isTryRun = options?.tryrun || false
        scheduler.cleanCookie = options?.cc || false
        scheduler.concurrency = options?.concurrency || 1
        scheduler.taskKey = (account.taskKey || account.user || 'default') + (scheduler.isTryRun ? '_tryrun' : '')
        scheduler.account = account
        process.env['taskKey'] = [command, scheduler.taskKey].join('_')
        scheduler.isRunning = true

        if (scheduler.isTryRun) {
            console.info('!!!当前运行在TryRun模式，仅建议在测试时运行!!!')
            await new Promise((resolve) => setTimeout(resolve, 3000))
        }
        console.info('将使用', scheduler.taskKey.replaceWithMask(2, scheduler.isTryRun ? 10 : 3), '作为账户识别码')

        await scheduler.genFileName(command)
        await scheduler.initTasksQueue()
        let { will_tasks } = await scheduler.loadTasksQueue(account.tasks)

        if (!will_tasks.length) {
            console.info('暂无可执行任务！')
            return
        }

        let { selectedTasks } = scheduler
        if (selectedTasks.length) {
            console.info('将只执行选择的任务', selectedTasks.join(','))
        }

        // 初始化处理
        let { tasks_result, init_funcs_result } = await scheduler.execInitFunc(command, will_tasks)

        // 立即任务
        await scheduler.buildExecQueue(command, tasks_result.filter(t => t.immediate), 100, init_funcs_result)

        // 普通任务
        await scheduler.buildExecQueue(command, tasks_result.filter(t => !t.immediate), scheduler.concurrency || 1, init_funcs_result)

        await console.sendLog()

        if (scheduler.cleanCookie) {
            await delCookiesFile([command, scheduler.taskKey].join('_'))
        }
    }
}
module.exports = {
    scheduler
}
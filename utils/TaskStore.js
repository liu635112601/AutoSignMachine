const fs = require('fs-extra')
var TaskStore = {
  loadStore: () => {
    return JSON.parse(fs.readFileSync(process.env.taskfile).toString('utf-8'))
  },
  saveStore: (store) => {
    fs.writeFileSync(process.env.taskfile, JSON.stringify(store))
  },
  checkTaskRunnig: (task) => {
    let taskJson = TaskStore.loadStore()
    let taskindex = taskJson.queues.findIndex(q => q.taskName === task.taskName)
    if (taskindex !== -1) {
      if (taskJson.queues[taskindex].isRunning) {
        return true
      }
    }
    return false
  },
  updateTask: (task, newTask) => {
    let taskJson = TaskStore.loadStore()
    let taskindex = taskJson.queues.findIndex(q => q.taskName === task.taskName)
    if (taskindex !== -1) {
      taskJson.queues[taskindex] = {
        ...taskJson.queues[taskindex],
        ...newTask
      }
    }
    TaskStore.saveStore(taskJson)
    return taskJson
  },
}
module.exports = TaskStore

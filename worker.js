
// Native
const fs = require("fs")
const path = require("path")
const util = require("util")

// Packages
const _ = require("lodash")
const sjson = require("simplified-json")
const schedule = require("node-schedule")
const exithook = require("async-exit-hook")

// Modules
const Store = require("./store")
const dropbox = require("./dropbox")
const instagram = require("./instagram")


//------------------------------------------------------------------------------
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN
const CONFIG_PATH = "/config.sjson"
const STORE_PATH = "/.store.json"

const ACTIONS = {
	upload_image: require("./actions/upload_image")
}


//------------------------------------------------------------------------------
// fs.readFile(path[, options], callback)
let read_file = util.promisify(fs.readFile)

// fs.writeFile(file, data[, options], callback)
let write_file = util.promisify(fs.writeFile)


//------------------------------------------------------------------------------
async function load_config() {
	//const sjson_str = await read_file("config.sjson")
	//return sjson.parse(sjson_str)
	const buffer = await dropbox.download_file(CONFIG_PATH)
	return sjson.parse(buffer.toString("utf8"))
}


//------------------------------------------------------------------------------
async function load_store() {
	try {
		const buffer = await dropbox.download_file(STORE_PATH)
		try {
			let state = JSON.parse(buffer.toString("utf8"))
			return new Store(state)
		}
		catch (error) {
			console.error("ERROR: malformed json: ", error)
			return new Store()
		}
	}
	catch (error) {
		// file not found, create empty store
		if (error.info.status == 409) {
			return new Store()
		}
		else {
			throw error
		}
	}
}


//------------------------------------------------------------------------------
function save_store(store) {
	const json_str = JSON.stringify(store.state(), null, 2)
	return dropbox.upload_file(STORE_PATH, json_str, true)
}


//------------------------------------------------------------------------------
async function setup_instagram_accounts(config) {
	let accounts = {}
	for (let account_name of Object.keys(config.instagram_accounts)) {
		let account_data = config.instagram_accounts[account_name]
		
		process.stdout.write("  - " + account_name + ".. ")
		let session = await instagram.create_session(account_name, account_data.password)
		process.stdout.write("done!\n")
		accounts[account_name] = { session }
	}
	return accounts
}


//------------------------------------------------------------------------------
function parse_task_definitions(config) {
	return _(config.task_definitions)
		.entries()
		.map(([task_name, task_definition]) => {
			const action_obj = ACTIONS[task_definition.action]
			if (!action_obj) {
				console.error("unknown action in task definition: " + task_definition.action)
				return
			}

			try {
				const action_args = action_obj.load_from_config(config, task_definition)
				return [task_name, {
					action_name: task_definition.action,
					action_func: action_obj.execute,
					action_args: action_args
				}]
			}
			catch (e) {
				console.error("Error while loading task: " + task_name)
				console.error(e)
			}
		})
		.compact()
		.fromPairs()
		.value()
}


//------------------------------------------------------------------------------
function prepare_tasks(config, accounts, task_definitions) {
	let parse_schedule_rules = (schedule_task) => {
		return _.map(schedule_task.schedule, (schedule) => {
			switch (schedule.mode) {
				case "cron":
					return schedule.spec
				case "date":
					return new Date(schedule.spec)
				default:
					throw new Error("invalid schedule mode: " + schedule.mode)
			}
		})
	}

	return _(config.schedule_tasks)
		.map((schedule_data) => {
			if (schedule_data.disabled)
				return

			try {
				let task_name = schedule_data.task
				let task_def = task_definitions[task_name]
				if (!task_def) {
					throw new Error("task definition not found: " + schedule_data.task)
				}
				
				let account_name = schedule_data.account
				if (!account_name) {
					throw new Error("account name not defined")
				}

				let account = accounts[account_name]
				if (!account) {
					throw new Error("account not found: " + schedule_data.account)
				}

				let schedule = parse_schedule_rules(schedule_data)

				return {
					task_name:   task_name,
					action_name: task_def.action_name,
					action_func: task_def.action_func,
					action_args: _.merge(task_def.action_args, {account_name, account}),
					schedule:    schedule
				}
			}
			catch (error) {
				console.error(`task '${task_name}' cannot be scheduled: `, error)
			}
		})
		.compact()
		.value()
}


//------------------------------------------------------------------------------
function schedule_tasks(task_list, store) {
	const now = Date.now()

	for (const task of task_list) {
		const action_func = task.action_func
		const action_args = task.action_args

		for (const rule of task.schedule) {
			if (rule instanceof Date && rule.getTime() < now) {
				//console.log("task cannot be scheduled in the past - " + rule)
				continue
			}
			
			const job = schedule.scheduleJob(rule, () => {
				console.log(`running ${task.task_name} next invocation -> ${job.nextInvocation()}`)
				
				action_func(action_args, store)
					.then(() => console.log("done!"))
					.catch(e => console.error(e))
			})

			console.log(`  - ${task.task_name} (${task.action_name}) -> ${job.nextInvocation()}`)
		}
	}
}


//------------------------------------------------------------------------------
async function setup_application() {
	try {
		console.log("starting up..")
		dropbox.initialize(DROPBOX_ACCESS_TOKEN)

		console.log("loading config..")
		let config = await load_config()
		let task_definitions = parse_task_definitions(config)

		console.log("loading store..")
		let store = await load_store()

		console.log("opening instagram sessions..")
		let accounts = await setup_instagram_accounts(config)

		console.log("scheduling tasks..")
		let tasks = prepare_tasks(config, accounts, task_definitions)
		schedule_tasks(tasks, store)

		exithook(async done => {
			try {
				if (store.is_dirty()) {
					await save_store(store)
					console.log("store saved")
				}
			}
			catch (e) {
				console.error("failed to save store: ", e)
			}

		    console.log("exiting")
		    done()
		})
	}
	catch (e) {
		console.error("[setup_application]: ", e)
	}
}


//------------------------------------------------------------------------------
setup_application().catch(console.error)


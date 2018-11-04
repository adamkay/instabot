
const _ = require("lodash")

module.exports = class Store {
	constructor(initial_state) {
		this._state = initial_state || {}
		this._subscribers = []
		this._dirty = false
	}

	subscribe(callback) {
		this._subscribers.push(callback)
	}

	get(path, def) {
		return _.get(this._state, path, def)
	}

	set(path, value) {
		this.set_dirty(true)
		_.set(this._state, path, value)
		_.each(this._subscribers, cb => cb(this))
	}

	is_dirty() {
		return this._dirty
	}

	set_dirty(dirty) {
		this._dirty = dirty
	}

	state() {
		return this._state
	}
}


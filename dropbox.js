
const path = require("path")

const _ = require("lodash")
const fetch = require("node-fetch")
const dropbox = require("dropbox")

let dbx = null

//------------------------------------------------------------------------------
let error_with_data = (msg, data) => _.merge(new Error(msg), data)

//------------------------------------------------------------------------------
function initialize(access_token) {
	dbx = new dropbox.Dropbox({
		fetch:       fetch,
		accessToken: access_token
	})
	// TODO: validate session
}

//------------------------------------------------------------------------------
async function list_files(folder_path) {
	folder_path = path.posix.join('/', folder_path)
	try {
		const response = await dbx.filesListFolder({ path: folder_path })
		return _(response.entries)
			.filter(x => x[".tag"] == "file")
			.map(x => ({ path: x.path_lower, hash: x.content_hash }))
			.value()
	}
	catch (e) {
		throw error_with_data("listing folder: " + folder_path, {info: e})
	}
}

//------------------------------------------------------------------------------
async function download_file(file_path) {
	try {
		const response = await dbx.filesDownload({ path: file_path })
		return response.fileBinary
	}
	catch (e) {
		throw error_with_data("downloading file: " + file_path, {info: e})
	}
}

//------------------------------------------------------------------------------
async function upload_file(file_path, contents, overwrite) {
	const args = {
		path: file_path,
		contents: contents,
		mute: true,
		mode: overwrite
			? {".tag": "overwrite"}
			: undefined
	}
	try {
		return await dbx.filesUpload(args)
	}
	catch (e) {
		throw error_with_data("uploading file: " + file_path, {info: e})
	}
}

module.exports = {
	initialize,
	list_files,
	download_file,
	upload_file
}


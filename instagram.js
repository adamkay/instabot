
const instagram = require('instagram-private-api').V1;

//------------------------------------------------------------------------------
function create_session(username, password, proxy_url) {
	return instagram.Session.create(
		new instagram.Device(username),
		new instagram.CookieMemoryStorage(),
		username,
		password,
		proxy_url)
}

//------------------------------------------------------------------------------
function upload_photo(session, file_or_buffer, caption) {
	return instagram.Upload.photo(session, file_or_buffer)
		.then(upload => {
			return instagram.Media.configurePhoto(session, upload.params.uploadId, caption)
		})
}

//------------------------------------------------------------------------------
function search_for_user(session, username) {
	return instagram.Account.searchForUser(session, username)
}

//------------------------------------------------------------------------------
async function follow_user(session, username) {
	let account = await search_for_user(session, username)
	return await instagram.Relationship.create(session, account.id)
}


module.exports = {
	create_session,
	upload_photo,
	follow_user
}


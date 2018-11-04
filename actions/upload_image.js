const path = require("path")

const _ = require("lodash")
const dropbox = require("../dropbox")
const instagram = require("../instagram")

//------------------------------------------------------------------------------
function load_from_config(config, task_definition) {
	let images_folder = task_definition.images_folder
	if (!_.isString(images_folder)) {
		throw new Error("images folder not specified")
	}

	let hashtag_group_name = task_definition.hashtag_group
	if (!_.isString(hashtag_group_name)) {
		throw new Error("hashtag group name not specified")
	}

	let hashtag_group = config.hashtag_groups[hashtag_group_name]
	if (!hashtag_group) {
		throw new Error("hashtag group not found: " + hashtag_group_name)
	}

	let hashtag_count = task_definition.hashtag_count || 5
	return {
		images_folder: images_folder,
		hashtag_group: hashtag_group,
		hashtag_count: hashtag_count
	}
}

//------------------------------------------------------------------------------
function generate_caption(tags, num_tags) {
	if (_.isArray(num_tags)) {
		num_tags = _.random(num_tags[0], num_tags[1])
	}
	const n = Math.min(num_tags, tags.length)
	return _(tags)
		//.shuffle().take(n)
		.sampleSize(n)
		.reduce((caption, tag) => caption + tag + ' ', '')
}

//------------------------------------------------------------------------------
async function select_image(folder_path, uploaded_image_hashes) {
	const files = await dropbox.list_files(folder_path)
	const exts = ['.jpg', '.jpeg']
	let jpegs = files.filter(x => exts.includes(path.extname(x.path)))
	if (uploaded_image_hashes) {
		jpegs = jpegs.filter(x => !uploaded_image_hashes[x.hash])
	}
	return jpegs[0]
}

//------------------------------------------------------------------------------
async function execute(context, store) {
	const image_hashes = store.get(["account_data", context.account_name, "image_hashes"], {})

	const image = await select_image(context.images_folder, image_hashes)
	if (!image) {
		throw (`  - all images (${context.images_folder}) were posted to your account (${context.account_name})`)
	}

	console.log("  - get image from dropbox: " + image.path)
	const image_buffer = await dropbox.download_file(image.path)

	const caption = generate_caption(context.hashtag_group, context.hashtag_count)
	console.log("  - post instagram photo: " + image.path + " -- " + caption)
	const media = await instagram.upload_photo(context.account.session, image_buffer, caption)

	store.set(["account_data", context.account_name, "image_hashes", image.hash], true)

	return image
}

module.exports = {
	load_from_config,
	execute
}


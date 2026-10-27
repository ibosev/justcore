// The library only touches document.readyState and DOMContentLoaded; Node's EventTarget covers both.
globalThis.document = Object.assign(new EventTarget(), { readyState: "complete" });
globalThis.VERSION = require("../../package.json").version;

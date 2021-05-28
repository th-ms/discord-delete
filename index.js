const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const inquirer = require('inquirer');
const rp = require('request-promise').defaults({jar: true});
const tough = require('tough-cookie');

puppeteer.use(StealthPlugin());

var CONNECTED = false;
var DETAILS = {};
var JAR = rp.jar();
var USER_ID = '';

function presentMenu() {
    console.clear();
    console.log("\n\nWelcome to Discord-Delete!\n\n");
    console.log("Discord Connected: " + (CONNECTED ? "\x1b[32mTrue\x1b[0m" : "\x1b[31mFalse\x1b[0m"));
    console.log("\n\n")
    inquirer.prompt([{
        type: 'list',
        name: 'choice',
        message: 'What would you like to do?',
        choices: [
            'Connect Discord',
            'Purge From Keyword(s)',
            'Purge From Server(s)',
            'Purge All'
        ]
    }]).then((res) => {
        switch(res.choice) {
            case 'Connect Discord': 
                if (CONNECTED) {
                    inquirer.prompt([{
                        type: 'confirm',
                        name: 'continue',
                        message: '\x1b[33mYou already have discord connected, would you like to connect again?\x1b[0m'
                    }]).then((res) => {
                        if (!res.continue) presentMenu();
                        else connectDiscord();
                    });
                } else connectDiscord().then((resp) => {
                    DETAILS = resp;
                    CONNECTED = true;
                    resp.cookies.forEach(cookie => {
                        let newCookie = new tough.Cookie({
                            key: cookie.name,
                            value: cookie.value,
                            domain: cookie.domain,
                        });
                        JAR.setCookie(cookie.toString(), 'https://discord.com/');
                    });
                    rp({
                        method: 'GET',
                        uri: 'https://discord.com/api/v9/users/@me/library',
                        jar: JAR,
                        headers: DETAILS.headers
                    }).then((resp) => {
                        try {
                            let data = JSON.parse(resp);
                            USER_ID = data[0].entitlements[0].user_id;
                            presentMenu();
                        } catch {
                            warning('Failed to fetch user data. Please try again.')
                        }
                    }).catch((err) => {
                        warning('Failed to fetch user data. Please try again.')
                    })
                });
                break;
            case 'Purge From Keyword(s)':
                if (!CONNECTED) warning('You must have discord connected to do that.')
                else {
                    fetchGuilds().then(guilds => {
                        console.log(guilds);
                    })
                }
                break;
            case 'Purge From Server(s)':
                if (!CONNECTED) warning('You must have discord connected to do that.')
                else {
                    console.clear();
                    inquirer.prompt([{
                        type: 'input',
                        name: 'ids',
                        message: 'Please enter the IDs of the servers to purge from (Separate with \',\'): '
                    }]).then((resp) => {
                        let servers = resp.ids.split(',');
                        fetchGuilds().then(guilds => {
                            var validServers = true;
                            for (i = 0; i < servers.length; i++) {
                                var found = false;
                                guilds.forEach(guild => {
                                    if (guild.guild_id == servers[i]) {
                                        found = true;
                                    }
                                })
                                if (!found) { validServers = false };
                            }
                            if (!validServers) {
                                console.clear();
                                inquirer.prompt([{
                                    type: 'confirm',
                                    name: 'continue',
                                    message: '\x1b[33mCould not locate server in common guild list (this may occur if you joined the server recently). Would you like to continue?\x1b[0m'
                                }]).then((res) => {
                                    if (!res.continue) presentMenu();
                                    else {
                                        purgeGuilds(servers).then(() => {success(`Successfully purged all messages from ${servers.length} servers!`)});
                                    }
                                });
                            } else {
                                console.clear();
                                inquirer.prompt([{
                                    type: 'confirm',
                                    name: 'continue',
                                    message: '\x1b[33mServers found, message purge will follow this confirmation. Would you like to continue?\x1b[0m'
                                }]).then((res) => {
                                    if (!res.continue) presentMenu();
                                    else {
                                        purgeGuilds(servers).then(() => {success(`Successfully purged all messages from ${servers.length} servers!`)});
                                    }
                                });
                            }
                        })
                    })
                }
                break;
            case 'Purge All':
                if (!CONNECTED) warning('You must have discord connected to do that.')
                break;
        }
    });
}

function warning(msg) {
    console.clear();
    inquirer.prompt([{
        type: 'list',
        name: '_',
        message: `\x1b[31m${msg}\x1b[0m`,
        choices: ['Press Enter To Continue']
    }]).then(() => {
        presentMenu();
    });
} 

function success(msg) {
    console.clear();
    inquirer.prompt([{
        type: 'list',
        name: '_',
        message: `\x1b[32m${msg}\x1b[0m`,
        choices: ['Press Enter To Continue']
    }]).then(() => {
        presentMenu();
    });
} 

async function connectDiscord() {
    return new Promise((resolve) => {
        puppeteer.launch({ headless: false }).then(async browser => {
            const page = await browser.newPage();
            await page.setRequestInterception(true);
            page.on('request', async (req) => {
                let headers = req.headers();
                if ("authorization" in headers && headers.authorization !== 'undefined' && !(headers.authorization.includes('Bearer'))) {
                    let cookies = await page.cookies();
                    await browser.close();
                    resolve({'cookies': cookies, 'headers': headers});
                }
                req.continue();
            });
            await page.goto('https://discord.com/login');
            console.clear();
            console.log('\n\nPlease login to discord.\n\n');
        })
    })
}

async function purgeGuilds(servers) {
    return new Promise(async (resolve) => {
        for (i = 0; i < servers.length; i++) {
            await purgeGuild(servers[i]);
        }
        resolve();
    })
}

async function purgeGuild(id) {
    return new Promise(async (resolve) => {
        console.clear();
        let messages = await fetchMessages(id);
        console.log(`Fetched ${messages.length} messages.`);
        for (i = 0; i < messages.length; i++) {
            await sleep(500);
            await deleteMessage(messages[i][0]);
        }
        console.clear();
        resolve();
    })
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function deleteMessage(message) {
    return new Promise((resolve) => {
        rp({
            method: 'DELETE',
            uri: `https://discord.com/api/v9/channels/${message.channel_id}/messages/${message.id}`,
            jar: JAR,
            headers: DETAILS.headers
        }).then((resp) => {
            console.log("\x1b[32mDeleted Message\x1b[0m");
            resolve();
        }).catch(async (err) => {
            try {
                await sleep(parseInt(JSON.parse('{'+s.split('{')[1]).retry_after*1000))
            } catch (err) {
                await sleep(1000);
            }
            deleteMessage(message).then(() => {resolve()});
        })
    })
}

async function fetchMessages(id, offset = 0, counted = 0) {
    var total_messages = [];
    var results = -1;
    return new Promise(async (resolve) => {
        rp({
            method: 'GET',
            uri: (`https://discord.com/api/v9/guilds/${id}/messages/search?author_id=${USER_ID}` + (offset > 0 ? `&offset=${offset}` : '')),
            jar: JAR,
            headers: DETAILS.headers
        }).then(async (resp) => {
            var data = JSON.parse(resp);
            var messages = data.messages;
            total_messages = total_messages.concat(messages);
            counted += messages.length;
            if (results == -1) {results = data.total_results}
            console.log(`Getting messages - ${counted}/${results}`);
            if (messages.length == 25) {
                offset += 25;
                var more_messages = await fetchMessages(id, offset, counted)
                total_messages = total_messages.concat(more_messages);
            }
            resolve(total_messages);
        }).catch((err) => {
            console.log(err);
        })
    })
}

async function fetchGuilds() {
    console.clear();
    console.log("\n\nFetching Guilds\n\n");
    return new Promise((resolve) => {
        rp({
            method: 'GET',
            uri: 'https://discord.com/api/v9/users/@me/affinities/guilds',
            jar: JAR,
            headers: DETAILS.headers
        }).then((resp) => {
            try {
                let guilds = JSON.parse(resp);
                console.log('\n\nFetched Guilds\n\n');
                resolve(guilds.guild_affinities);
            } catch {
                console.log('\n\nError Fetching Guilds, Retrying...\n\n');
                fetchGuilds.then(e => resolve(e));
            }
        }).catch((err) => {
            console.log('\n\nError Fetching Guilds, Retrying...\n\n');
            console.log(err);
            fetchGuilds.then(e => resolve(e));
        })
    });
}

presentMenu();

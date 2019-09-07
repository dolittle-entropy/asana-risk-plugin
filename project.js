const Asana = require('asana');
const BodyParser = require('body-parser');
const EventEmitter = require('events');
const Crypto = require('crypto');

class Tracker extends EventEmitter {
    constructor(accessToken, projectId) {
        super();

        this._client = Asana.Client.create({ defaultHeaders: { 'asana-enable': 'string_ids,new_sections' }}).useAccessToken(accessToken);
        this._projectId = projectId;
        this._updates = [];
    }

    getAllTasks() {
        return new Promise((resolve, reject) => {
            this._handleTaskPage([], this._client.tasks.findByProject(this._projectId), resolve, reject);
        });
    }

    _handleTaskPage(list, promise, resolve, reject) {
        promise.then((taskPage) => {
            if (taskPage == null) {
                if (list.length > 0) {
                    const task = list.pop();
                    const promise = this._client.tasks.findById(task.gid);
                    this._getAllTasksFull(list, [], promise, resolve, reject);
                } else {
                    resolve([]);
                }
            } else {
                list.push.apply(list, taskPage.data);
                this._handleTaskPage(list, taskPage.nextPage(), resolve, reject);
            }
        }).catch((err) => {
            reject(err.value.errors);
        });
    }

    _getAllTasksFull(list, full, promise, resolve, reject) {
        promise.then((task) => {
            full.push(task);
            if (list.length == 0) {
                resolve(full);
            } else {
                const task = list.pop();
                const promise = this._client.tasks.findById(task.gid);
                this._getAllTasksFull(list, full, promise, resolve, reject);
            }
        }).catch((err) => {
            reject(err.value.errors);
        });
    }

    updateTask(taskId, update) {
        return new Promise((resolve, reject) => {
            this._client.tasks.update(taskId, update).then(() => {
                this._updates.push(taskId);
                resolve();
            }).catch((err) => {
                reject(err.value.errors);
            });
        });
    }

    webhook() {
        const parser = BodyParser.raw({ type: 'application/*'});
        const handler = (req, res, next) => {
            if (req.get('X-Hook-Secret')) {
                // Webhook handshake
                this._handleHandshake(req, res);
            } else if (req.get('X-Hook-Signature')) {
                // Webhook events
                parser(req, res, (err) => {
                    if (err) {
                        next(err);
                    } else {
                        this._handleEvents(req, res);
                    }
                });
            } else {
                next();
            }
        };
        return handler;
    }

    createWebhook(endpoint) {
        return new Promise((resolve, reject) => {
            this._client.webhooks.create(this._projectId, endpoint).then((webhook) => {
                console.log('Created webhook id', webhook.gid, 'pointing to', webhook.target);
                this._hookId = webhook.gid;
                resolve(this._hookId);
            }).catch((err) => {
                console.error('Error creating webhook', err.value.errors);
                reject(err.value.errors);
            });
        });
    }
    
    deleteWebhook() {
        return new Promise((resolve, reject) => {
            if (this._hookId) {
                this._client.webhooks.deleteById(this._hookId).then(() => {
                    this._hookId = undefined;
                    resolve(this._hookId);
                }).catch((err) => {
                    console.error('Error deleting webhook', err.value.errors);
                    reject(err.value.errors);
                });
            } else {
                resolve();
            }
        });
    }

    _handleHandshake(req, res) {
        this._hookSecret = req.get('X-Hook-Secret');
        res.set('X-Hook-Secret', this._hookSecret);
        res.status(200).end();
    }

    _handleEvents(req, res) {
        const verifyer = Crypto.createHmac('sha256', this._hookSecret);
        verifyer.update(req.body);

        const recieved = req.get('X-Hook-Signature');
        const calculated = verifyer.digest('hex');

        if (recieved === calculated) {
            const body = JSON.parse(req.body.toString('utf8'));
            body.events.forEach((event) => this._handleEvent(event));
            res.status(200).end();
        } else {
            res.sendStatus(400);
        }
    }

    _handleEvent(event) {
        if (event.action === 'changed' &&
            event.parent == null &&
            event.resource.resource_type === 'task' &&
            event.resource.resource_subtype === 'default_task'
        ) {
            const index = this._updates.indexOf(event.resource.gid);
            if (index < 0) {
                this._client.tasks.findById(event.resource.gid).then((task) => {
                    this.emit('task_changed', task);
                }).catch((err) => {
                    console.error('Error getting task data:', err.value.errors);
                });
            } else {
                this._updates.splice(index, 1);
            }
        }
    }
}

exports.Tracker = Tracker;
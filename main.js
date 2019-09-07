const Express = require('express');
const Process = require('process');
const Project = require('./project');

const getEnvironmentalVariable = (name) => {
    if (Process.env.hasOwnProperty(name)) {
        return Process.env[name];
    } else {
        console.error('Environmental variable', name, 'not set. Quitting...');
        Process.exit(1);
    }
};

const probabilityFieldId = getEnvironmentalVariable('PROBABILITY_FIELD_ID');
const impactFieldId = getEnvironmentalVariable('IMPACT_FIELD_ID');
const riskFieldId = getEnvironmentalVariable('RISK_FIELD_ID');

const app = Express();
const tracker = new Project.Tracker(getEnvironmentalVariable('ACCESS_TOKEN'), getEnvironmentalVariable('PROJECT_ID'));

app.use(tracker.webhook());

const getFieldAsNumber = (task, fieldId) => {
    const value = task.custom_fields.find((customField) => fieldId == customField.gid);
    if (!value) return 0;
    else return Number(value.enum_value.name);
};

const updateTaskRisk = (task) => {
    const probability = getFieldAsNumber(task, probabilityFieldId);
    const impact = getFieldAsNumber(task, impactFieldId);
    const risk = probability*impact;
    if (risk > 0) {
        console.log('Updating:', task.gid);
        const update = { custom_fields: {}};
        update.custom_fields[riskFieldId] = -risk;
        tracker.updateTask(task.gid, update)
    }
};

tracker.on('task_changed', (task) => {
    console.log('Task changed:', task.gid);
    updateTaskRisk(task);
});

app.listen(3000, () => {
    console.log('Listening on port 3000');

    tracker.createWebhook(getEnvironmentalVariable('WEBHOOK_ENDPOINT')).then(() => {
        tracker.getAllTasks().then((tasks) => {
            console.log('Updating all task risks...');
            tasks.forEach((task) => {
                updateTaskRisk(task);
            });
        }).catch((err) => {
            console.error('Error getting all tasks:', err);
        })
    }).catch(() => {
        Process.exit(1);
    });
});


let shuttingDown = false;
const handleExit = () => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log('Shutting down...');
    tracker.deleteWebhook().then(() => {
        Process.exit(0);
    }).catch(() => {
        Process.exit(1);
    });
};
Process.on('SIGINT', handleExit);
Process.on('SIGTERM', handleExit);

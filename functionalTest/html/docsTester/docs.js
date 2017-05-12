'use strict';

var api = require('../../api/api').create(),
    jsdom = require('jsdom'),
    Q = require('q');

function getDOM (endpoint) {
    var deferred = Q.defer(),
        url = api.url + endpoint;

    jsdom.env({
        url: url,
        done: function (errors, window) {
            if (errors) {
                deferred.reject(errors);
            }
            else {
                deferred.resolve(window);
            }
        }
    });
    return deferred.promise;
}

function getAttribute (element, attributeName) {
    var attribute = element.attributes[attributeName];
    return attribute ? attribute.value : '';
}

function processText (element) {
    if (element.textContent.indexOf('http://origin-server.com') >= 0) {
        var replacements = element.getElementsByTagName('change');
        for (var i = 0; i < replacements.length; i += 1) {
            replacements[i].textContent = getAttribute(replacements[i], 'to');
        }
    }
    return element.textContent.trim();
}

function createTestSpec (endpoint, id) {
    return {
        endpoint: endpoint,
        name: id,
        steps: [],
        execute: function () {
            var steps = this.steps.map(function (step) {
                    return function () {
                        try {
                            var executor = require('./testTypes/' + step.type);
                            return executor.runStep(step);
                        }
                        catch (e) {
                            console.log('Invalid step type:');
                            console.log(JSON.stringify(step, null, 4));
                            throw e;
                        }
                    };
                }),
                that = this;

            return steps.reduce(Q.when, Q()).then(function () { return Q(that); });
        }
    };
}

function addStep (test, stepSpec) {
    var stepIndex = (stepSpec.stepId || stepSpec.verifyStepId || 0) - 1,
        addReplacementsTo = function (text) {
            var pattern = new RegExp(stepSpec.replacePattern, 'g'),
                substitution = stepSpec.replaceWith.replace('${port}', api.port);
            return text.replace(pattern, substitution);
        };

    if (stepIndex < 0) {
        return;
    }

    if (!test.steps[stepIndex]) {
        test.steps[stepIndex] = {
            id: stepIndex + 1,
            type: stepSpec.testType,
            ignoreLines: [],
            port: stepSpec.port,
            execute: addReplacementsTo(stepSpec.text),
            filename: stepSpec.filename
        };
    }
    if (stepSpec.verifyStepId) {
        test.steps[stepIndex].verify = addReplacementsTo(stepSpec.text);

        if (stepSpec.ignoreLines) {
            test.steps[stepIndex].ignoreLines = JSON.parse(stepSpec.ignoreLines);
        }
    }
}

function get (endpoint) {
    var deferred = Q.defer();

    getDOM(endpoint).done(function (window) {
        var elements = window.document.getElementsByTagName('code'),
            tests = {};

        for (var i = 0; i < elements.length; i += 1) {
            var element = elements[i],
                testId = getAttribute(element, 'data-test-id'),
                stepSpec = {
                    stepId: getAttribute(element, 'data-test-step'),
                    testType: getAttribute(element, 'data-test-type'),
                    verifyStepId: getAttribute(element, 'data-test-verify-step'),
                    ignoreLines: getAttribute(element, 'data-test-ignore-lines'),
                    text: processText(element),
                    port: getAttribute(element, 'data-test-port'),
                    filename: getAttribute(element, 'data-test-filename'),
                    replacePattern: getAttribute(element, 'data-test-replace-pattern'),
                    replaceWith: getAttribute(element, 'data-test-replace-with')
                };

            if (testId) {
                if (!tests[testId]) {
                    tests[testId] = createTestSpec(endpoint, testId);
                }
                addStep(tests[testId], stepSpec);
            }
        }
        deferred.resolve(tests);
    });
    return deferred.promise;
}

module.exports = {
    get: get
};

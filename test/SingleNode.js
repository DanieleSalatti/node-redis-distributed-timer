'use strict';

var DTimer = require('..').DTimer;
var async = require('async');
var assert = require('assert');
var debug = require('debug')('dtimer');
var Promise = require('bluebird');
var redis = Promise.promisifyAll(require("redis"));

describe('Single node', function () {
    var pub = null;
    var sub = null;
    var dt  = null;

    before(function () {
    });

    beforeEach(function (done) {
        var conns = 0;
        pub = redis.createClient();
        pub.once('ready', function () { conns++; });
        sub = redis.createClient();
        sub.once('ready', function () { conns++; });
        async.whilst(
            function () { return (conns < 2); },
            function (next) {
                setTimeout(next, 100);
            },
            function (err) {
                if (err) {
                    return void(done(err));
                }
                async.series([
                    function (next) {
                        pub.select(9, next);
                    },
                    function (next) {
                        pub.flushdb(next);
                    }
                ], function (err) {
                    if (err) { return void(done(err)); }
                    dt = new DTimer('ch1', pub, sub, { confTimeout: 1 });
                    done();
                });
            }
        );
    });

    afterEach(function () {
        dt.removeAllListeners();
        dt = null;
        pub.removeAllListeners();
        pub.end();
        pub = null;
        sub.removeAllListeners();
        sub.end();
        sub = null;
    });

    it('Post and receive one event', function (done) {
        var evt = { msg: 'hello' };
        var delay = 500;
        async.series([
            function (next) {
                dt.join(function () {
                    next();
                });
            },
            function (next) {
                var since = Date.now();
                var numEvents = 0;
                dt.post(evt, delay, function (err) {
                    assert.ifError(err);
                });
                dt.on('event', function (ev) {
                    var elapsed = Date.now() - since;
                    numEvents++;
                    assert.deepEqual(ev.msg, evt.msg);
                    assert(elapsed < delay * 1.1);
                    assert(elapsed > delay * 0.9);
                });
                setTimeout(function () {
                    assert.equal(numEvents, 1);
                    next();
                }, 1000);
            },
            function (next) {
                dt.leave(function () {
                    next();
                });
            }
        ], function (err, results) {
            void(results);
            done(err);
        });
    });

    it('Post and receive one event with id', function (done) {
        var evt = { id: 'my_event', maxRetries: 0, msg: 'hello' };
        var delay = 500;
        async.series([
            function (next) {
                dt.join(function () {
                    next();
                });
            },
            function (next) {
                var since = Date.now();
                var numEvents = 0;
                dt.post(evt, delay, function (err, evId) {
                    assert.ifError(err);
                    assert.equal(evId, evt.id);
                });
                dt.on('event', function (ev) {
                    var elapsed = Date.now() - since;
                    numEvents++;
                    assert.strictEqual(ev.msg, evt.msg);
                    assert(elapsed < delay * 1.1);
                    assert(elapsed > delay * 0.9);
                });
                setTimeout(function () {
                    assert.equal(numEvents, 1);
                    next();
                }, 1000);
            },
            function (next) {
                dt.leave(function () {
                    next();
                });
            }
        ], function (err, results) {
            void(results);
            done(err);
        });
    });

    it('Post and receive many events', function (done) {
        var evts = [
            { msg: { msg: 'msg0' }, delay: 10 },
            { msg: { msg: 'msg1' }, delay: 10 },
            { msg: { msg: 'msg2' }, delay: 10 },
            { msg: { msg: 'msg3' }, delay: 10 },
            { msg: { msg: 'msg4' }, delay: 10 },
            { msg: { msg: 'msg5' }, delay: 10 },
            { msg: { msg: 'msg6' }, delay: 10 },
            { msg: { msg: 'msg7' }, delay: 10 },
            { msg: { msg: 'msg8' }, delay: 10 },
            { msg: { msg: 'msg9' }, delay: 10 }
        ];
        var numRcvd = 0;
        async.series([
            function (next) {
                dt.join(function () {
                    next();
                });
            },
            function (next) {
                var since = Date.now();
                evts.forEach(function (evt) {
                    dt.post(evt.msg, evt.delay, function (err, evId) {
                        assert.ifError(err);
                        evt.id = evId;
                        evt.postDelay = Date.now() - since;
                        evt.posted = true;
                    });
                });
                dt.on('event', function (ev) {
                    var elapsed = Date.now() - since;
                    evts.forEach(function (evt) {
                        if (evt.msg.msg === ev.msg) {
                            numRcvd++;
                            evt.elapsed = elapsed;
                            evt.rcvd = ev;
                            evt.order = numRcvd;
                        }
                    });
                });
                setTimeout(next, 100);
            },
            function (next) {
                dt.leave(function () {
                    next();
                });
            }
        ], function (err, results) {
            void(results);
            evts.forEach(function (evt) {
                assert.ok(evt.posted);
                assert.strictEqual(evt.msg.msg, evt.rcvd.msg);
                assert(evt.elapsed < evt.delay + 200);
                assert(evt.elapsed > evt.delay);
            });
            assert.equal(numRcvd, evts.length);
            done(err);
        });
    });

    it('Post and receive many events', function (done) {
        var evts = [
            { msg: { msg: 'msg0' }, delay: 50 },
            { msg: { msg: 'msg1' }, delay: 50 },
            { msg: { msg: 'msg2' }, delay: 50 },
            { msg: { msg: 'msg3' }, delay: 50 },
            { msg: { msg: 'msg4' }, delay: 50 },
            { msg: { msg: 'msg5' }, delay: 50 },
            { msg: { msg: 'msg6' }, delay: 50 },
            { msg: { msg: 'msg7' }, delay: 50 },
            { msg: { msg: 'msg8' }, delay: 50 },
            { msg: { msg: 'msg9' }, delay: 50 }
        ];
        var numRcvd = 0;
        dt.maxEvents = 5;
        async.series([
            function (next) {
                dt.join(function () {
                    next();
                });
            },
            function (next) {
                var since = Date.now();
                evts.forEach(function (evt) {
                    dt.post(evt.msg, evt.delay, function (err, evId) {
                        assert.ifError(err);
                        evt.id = evId;
                        evt.postDelay = Date.now() - since;
                        evt.posted = true;
                    });
                });
                dt.on('event', function (ev) {
                    var elapsed = Date.now() - since;
                    evts.forEach(function (evt) {
                        if (evt.msg.msg === ev.msg) {
                            numRcvd++;
                            evt.elapsed = elapsed;
                            evt.rcvd = ev;
                            evt.order = numRcvd;
                        }
                    });
                });
                setTimeout(next, 100);
            },
            function (next) {
                dt.leave(function () {
                    next();
                });
            }
        ], function (err, results) {
            void(results);
            evts.forEach(function (evt) {
                assert.ok(evt.posted);
                assert.deepEqual(evt.msg.msg, evt.rcvd.msg);
                assert(evt.elapsed < evt.delay + 200);
                assert(evt.elapsed > evt.delay);
            });
            assert.equal(numRcvd, evts.length);
            done(err);
        });
    });

    it('Post then cancel', function (done) {
        var evt = { msg: 'hello' };
        var delay = 500;
        async.series([
            function (next) {
                dt.join(function () {
                    next();
                });
            },
            function (next) {
                var numEvents = 0;
                dt.post(evt, delay, function (err, evId) {
                    assert.ifError(err);
                    dt.cancel(evId, function (err) {
                        assert.ifError(err);
                    });
                });
                dt.on('event', function (ev) {
                    numEvents++;
                    assert.deepEqual(ev, evt);
                });
                setTimeout(function () {
                    assert.equal(numEvents, 0);
                    next();
                }, 1000);
            },
            function (next) {
                dt.leave(function () {
                    next();
                });
            }
        ], function (err, results) {
            void(results);
            done(err);
        });
    });

    it('Post with confirmation', function (done) {
        var evt = { id: 'myEvent', maxRetries: 1, msg: 'hello' };
        var delay = 500;
        async.series([
            function (next) {
                dt.join(function () {
                    next();
                });
            },
            function (next) {
                var since = Date.now();
                var numEvents = 0;
                dt.post(evt, delay, function (err, evId) {
                    assert.ifError(err);
                    assert.equal(evId, evt.id);
                });
                dt.on('event', function (ev) {
                    var elapsed = Date.now() - since;
                    numEvents++;
                    assert.equal(numEvents, 1);
                    assert.strictEqual(ev.id, evt.id);
                    assert.strictEqual(ev.msg, evt.msg);
                    assert(elapsed < delay * 1.1);
                    assert(elapsed > delay * 0.9);

                    dt.confirm(ev.id, next);
                });
            },
            function (next) {
                setTimeout(next, 3000); // run for a while
            },
            function (next) {
                dt.leave(function () {
                    next();
                });
            }
        ], function (err, results) {
            void(results);
            done(err);
        });
    });

    it('Post, ignore 1st & 2nd events, then confirm the 3rd', function (done) {
        var evt = { id: 'myEvent', maxRetries: 2, msg: 'hello' };
        var delay = 500;
        async.series([
            function (next) {
                dt.join(function () {
                    next();
                });
            },
            function (next) {
                var since = Date.now();
                var numEvents = 0;
                dt.post(evt, delay, function (err, evId) {
                    assert.ifError(err);
                    assert.equal(evId, evt.id);
                });
                dt.on('event', function (ev) {
                    var elapsed = Date.now() - since;
                    numEvents++;
                    assert.strictEqual(ev.id, evt.id);
                    assert.strictEqual(ev.msg, evt.msg);
                    if (numEvents === 1) {
                        assert(elapsed < delay * 1.1);
                        assert(elapsed > delay * 0.9);
                    } else if (numEvents === 2) {
                        assert.equal(ev._numRetries, 1);
                    } else if (numEvents === 3) {
                        assert.equal(ev._numRetries, 2);
                        dt.confirm(ev.id, next);
                    } else {
                        assert(false, 'unexpected event');
                    }
                });
            },
            function (next) {
                setTimeout(next, 2000); // run for a while
            },
            function (next) {
                dt.leave(function () {
                    next();
                });
            }
        ], function (err, results) {
            void(results);
            done(err);
        });
    });

    it('Post then peek the event', function (done) {
        var evt = { id: 'myEvent', msg: 'hello' };
        var delay = 2000;
        async.series([
            function (next) {
                dt.join(function () {
                    next();
                });
            },
            function (next) {
                dt.post(evt, delay, function (err, evId) {
                    assert.ifError(err);
                    assert.equal(evId, evt.id);

                    // peek the event right away
                    dt.peek(evId, function (err, results) {
                        assert.ifError(err);
                        assert.ok(Array.isArray(results));
                        assert.equal(results.length, 2);
                        assert.equal(typeof results[0], 'number');
                        assert.ok(results[0] < delay*1.1);
                        assert.ok(results[0] > delay*0.9);
                        assert.strictEqual(results[1].id, evt.id);
                        assert.strictEqual(results[1].msg, evt.msg);
                        next();
                    });
                });
            },
            function (next) {
                dt.leave(function () {
                    next();
                });
            }
        ], function (err, results) {
            void(results);
            done(err);
        });
    });

    it('Peek event that does not exist', function (done) {
        async.series([
            function (next) {
                dt.peek('notExist', function (err, results) {
                    assert.ifError(err);
                    assert.ok(Array.isArray(results));
                    assert.equal(results.length, 2);
                    assert.strictEqual(results[0], null);
                    assert.strictEqual(results[1], null);
                    next();
                });
            },
            function (next) {
                dt.leave(function () {
                    next();
                });
            }
        ], function (err, results) {
            void(results);
            done(err);
        });
    });

    it('Post then change delay', function (done) {
        var evt = { id: 'myEvent', msg: 'hello' };
        var delay = 500;
        async.series([
            function (next) {
                dt.join(function () {
                    next();
                });
            },
            function (next) {
                var since = Date.now();
                var numEvents = 0;
                dt.post(evt, 5000, function (err, evId) {
                    assert.ifError(err);
                    assert.equal(evId, evt.id);

                    // change delay right away
                    dt.changeDelay(evId, delay, function (err, ok) {
                        assert.ifError(err);
                        assert.strictEqual(ok, 1);
                    });
                });
                dt.on('event', function (ev) {
                    var elapsed = Date.now() - since;
                    numEvents++;
                    assert.equal(numEvents, 1);
                    assert.strictEqual(ev.id, evt.id);
                    assert.strictEqual(ev.msg, evt.msg);
                    assert(elapsed < delay * 1.1);
                    assert(elapsed > delay * 0.9);
                    next();
                });
            },
            function (next) {
                setTimeout(next, 2000); // run for a while
            },
            function (next) {
                dt.leave(function () {
                    next();
                });
            }
        ], function (err, results) {
            void(results);
            done(err);
        });
    });

    describe('#upcoming', function () {
        beforeEach(function (done) {
            dt.join(done);
        });

        function post3events(ev1, ev2, ev3, ids, cb) {
            async.series([
                function (next) {
                    debug('post 1..');
                    dt.post(ev1, 1000, function (err, evId) {
                        assert.ifError(err);
                        ids.push(evId);
                        next();
                    });
                },
                function (next) {
                    debug('post 2..');
                    dt.post(ev2, 2000, function (err, evId) {
                        assert.ifError(err);
                        ids.push(evId);
                        next();
                    });
                },
                function (next) {
                    debug('post 3..');
                    dt.post(ev3, 3000, function (err, evId) {
                        assert.ifError(err);
                        ids.push(evId);
                        next();
                    });
                }
            ], cb);
        }

        it('upcoming() with no event', function (done) {
            var ids = [];
            var events;
            async.series([
                function (next) {
                    debug('upcoming..');
                    dt.upcoming(function (err, _events) {
                        assert.ifError(err);
                        events = _events;
                        next();
                    });
                },
                function (next) {
                    dt.leave(function () {
                        next();
                    });
                }
            ], function (err) {
                debug('events=' + JSON.stringify(events, null, 2));
                assert.ifError(err);
                assert.strictEqual(ids.length, 0);
                assert.strictEqual(Object.keys(events).length, 0);
                done();
            });
        });

        it('upcoming() to retrieve all events', function (done) {
            var evt = { msg: 'hello' };
            var ids = [];
            var events;
            async.series([
                function (next) {
                    debug('posting..');
                    post3events(evt, evt, evt, ids, next);
                },
                function (next) {
                    debug('upcoming..');
                    dt.upcoming(function (err, _events) {
                        assert.ifError(err);
                        events = _events;
                        next();
                    });
                },
                function (next) {
                    dt.leave(function () {
                        next();
                    });
                }
            ], function (err) {
                debug('events=' + JSON.stringify(events, null, 2));
                assert.ifError(err);
                assert.strictEqual(ids.length, 3);
                assert.strictEqual(Object.keys(events).length, 3);
                done();
            });
        });

        it('upcoming() to retrieve just 2 events using limit', function (done) {
            var evt = { msg: 'hello' };
            var ids = [];
            var events;
            async.series([
                function (next) {
                    debug('posting..');
                    post3events(evt, evt, evt, ids, next);
                },
                function (next) {
                    debug('upcoming..');
                    dt.upcoming({ limit: 2 }, function (err, _events) {
                        assert.ifError(err);
                        events = _events;
                        next();
                    });
                },
                function (next) {
                    dt.leave(function () {
                        next();
                    });
                }
            ], function (err) {
                debug('events=' + JSON.stringify(events, null, 2));
                assert.ifError(err);
                assert.strictEqual(ids.length, 3);
                assert.strictEqual(Object.keys(events).length, 2);
                done();
            });
        });

        it('upcoming() to retrieve just 1 event using duration', function (done) {
            var evt = { msg: 'hello' };
            var ids = [];
            var events;
            async.series([
                function (next) {
                    debug('posting..');
                    post3events(evt, evt, evt, ids, next);
                },
                function (next) {
                    debug('upcoming..');
                    dt.upcoming({ duration: 1100 }, function (err, _events) {
                        assert.ifError(err);
                        events = _events;
                        next();
                    });
                },
                function (next) {
                    dt.leave(function () {
                        next();
                    });
                }
            ], function (err) {
                debug('events=' + JSON.stringify(events, null, 2));
                assert.ifError(err);
                assert.strictEqual(ids.length, 3);
                assert.strictEqual(Object.keys(events).length, 1);
                done();
            });
        });

        it('upcoming() to retrieve just 2 event using offset', function (done) {
            var evt = { msg: 'hello' };
            var ids = [];
            var events;
            async.series([
                function (next) {
                    debug('posting..');
                    post3events(evt, evt, evt, ids, next);
                },
                function (next) {
                    debug('upcoming..');
                    dt.upcoming({ offset: 1100 }, function (err, _events) {
                        assert.ifError(err);
                        events = _events;
                        next();
                    });
                },
                function (next) {
                    dt.leave(function () {
                        next();
                    });
                }
            ], function (err) {
                debug('events=' + JSON.stringify(events, null, 2));
                assert.ifError(err);
                assert.strictEqual(ids.length, 3);
                assert.strictEqual(Object.keys(events).length, 2);
                done();
            });
        });

        it('upcoming() to retrieve just 1 event using both offset and duration', function (done) {
            var evt = { msg: 'hello' };
            var ids = [];
            var events;
            async.series([
                function (next) {
                    debug('posting..');
                    post3events(evt, evt, evt, ids, next);
                },
                function (next) {
                    debug('upcoming..');
                    dt.upcoming({ offset: 1100, duration: 1000 }, function (err, _events) {
                        assert.ifError(err);
                        events = _events;
                        next();
                    });
                },
                function (next) {
                    dt.leave(function () {
                        next();
                    });
                }
            ], function (err) {
                debug('events=' + JSON.stringify(events, null, 2));
                assert.ifError(err);
                assert.strictEqual(ids.length, 3);
                assert.strictEqual(Object.keys(events).length, 1);
                done();
            });
        });
    });
});

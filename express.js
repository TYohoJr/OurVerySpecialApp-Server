var bodyParser = require('body-parser');
var express = require("express");
var app = express();
var MongoClient = require('mongodb').MongoClient;
var bcrypt = require('bcrypt');
const saltRounds = 10;
var jwt = require('jsonwebtoken');
var path = require('path')
require('dotenv').config();
var cron = require('node-cron');

var twilio = require('twilio');
var client = new twilio(`${process.env.TW_ACC}`, `${process.env.TW_KEY}`);

app.use(express.static(path.join(__dirname, "build")));
app.use(bodyParser.json({ type: 'application/json' }));
app.use(bodyParser.urlencoded({ extended: true }));

var db;
var task = [];

Array.prototype.remove = function () {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};

function verifyToken(req, res, next) {
    var token = req.body.token;
    if (token) {
        jwt.verify(token, "Secret", (err, decode) => {
            if (err) {
                res.send("Wrong token")
            } else {
                res.locals.decode = decode
                next();
            }
        })
    } else {
        res.send("No token")
    }
}

MongoClient.connect(`mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@ds261838.mlab.com:61838/dine-amite`, (err, client) => {
    if (err) return console.log(err)
    db = client.db("dine-amite") // whatever your database name is
    app.listen(process.env.PORT || 8080, () => {
        console.log("listening on 8080")
    })
})

app.get("/", (req, res) => {
    res.sendFile("index.html")
})

app.post("/text", verifyToken, (req, res) => {
    if (req.body.number.length) {
        console.log(req.body)
        client.messages.create({
            to: `${req.body.number}`,
            from: '+12407166198',
            body: 'You have successfully signed up for daily Dine-amite text alerts!'
        });
        task[req.body.number] = cron.schedule('28 * * * *', function () {
            client.messages.create({
                to: `${req.body.number}`,
                from: '+12407166198',
                body: `Visit our page for today's lunch specials! https://dine-amite.herokuapp.com/`
            });
            console.log(`daily text sent to ${req.body.number}`)

            res.json("User has signed up for text alerts")
        });
    } else {
        res.json("Message not sent, not logged in")
    }
})

app.post("/signInData", (req, res) => {
    db.collection("users").find({ username: req.body.username }).toArray((err, user) => {
        console.log(user)
        if (!user.length) {
            res.json("Login unsuccessfull");
        } else if (err) {
            res.json("Login unsuccessfull");
        }
        bcrypt.compare(req.body.password, user[0].password, function (err, resolve) {
            //res == true
            if (resolve === true) {
                var token = jwt.sign(req.body.username, ('Secret'), {
                    //expiresInMinutes: 1440 // expires in 24 hours, no longer valid, probs deprecated
                });
                res.json({
                    message: "Login successful!",
                    myToken: token,
                    number: user[0].number,
                    tncSubscribe: user[0].tncSubscribe
                });
                console.log("Sign in successful")
            } else if (resolve === false) {
                res.json({
                    message: "Login failed!",
                })
            }
        });
    })
});

app.post('/signUpData', (req, res) => {
    if (req.body.username.length && req.body.password.length) {
        db.collection('users').find({ username: req.body.username }).toArray((err, dataMatch) => {
            if (!dataMatch.length) {
                if (req.body.number.length === 10) {
                    req.body.number = `+1${req.body.number}`
                    bcrypt.hash(req.body.password, saltRounds, function (err, hash) {
                        // Store hash in your password DB.
                        db.collection('users').save({ username: req.body.username, password: hash, number: req.body.number }, (err, result) => {
                            if (err) {
                                res.json("Failed")
                                return console.log(err);
                            } else {
                                res.json("Sign Up Successful")
                                console.log('saved to database');
                            }
                        });
                    });
                } else {
                    res.json(`Please enter a 10 digit phone number`)
                }
            } else {
                res.json('This username already exists')
            }
        })
    } else {
        res.json('Error: username or password can\'t be blank')
    }
});

app.post("/textTnC", verifyToken, (req, res) => {
    db.collection('users').save({ tncSubscribe: "TnC" }, (err, result) => {
    });
    if (req.body.number.length) {
        console.log(req.body)
        client.messages.create({
            to: `${req.body.number}`,
            from: '+12407166198',
            body: 'You have successfully signed up for daily Town and Country text alerts from Dineamite!'
        });
        task[req.body.number] = cron.schedule('30 11 * * *', function () {
            client.messages.create({
                to: `${req.body.number}`,
                from: '+12407166198',
                body: `Visit our page for today's lunch specials for Town and Country! https://dine-amite.herokuapp.com/`
            });
            console.log(`daily TnC text sent to ${req.body.number}`)
            res.json("User has signed up for TnC text alerts")
        });
        console.log(task)
    } else {
        res.json("Message not sent, not logged in")
    }
})

app.post("/textHeebs", verifyToken, (req, res) => {
    if (req.body.number.length) {
        console.log(req.body)
        client.messages.create({
            to: `${req.body.number}`,
            from: '+12407166198',
            body: 'You have successfully signed up for daily Heebs text alerts from Dineamite!'
        });
        task[req.body.number] = cron.schedule('0 10 * * *', function () {
            client.messages.create({
                to: `${req.body.number}`,
                from: '+12407166198',
                body: `Visit our page for today's lunch specials for Heebs! https://dine-amite.herokuapp.com/`
            });
            console.log(`daily Heebs text sent to ${req.body.number}`)
            res.json("User has signed up for Heebs text alerts")
        });
        console.log(task)
    } else {
        res.json("Message not sent, not logged in")
    }
})

app.post("/textDaves", verifyToken, (req, res) => {
    if (req.body.number.length) {
        console.log(req.body)
        client.messages.create({
            to: `${req.body.number}`,
            from: '+12407166198',
            body: 'You have successfully signed up for daily Daves Sushi text alerts from Dineamite!'
        });
        task[req.body.number] = cron.schedule('0 3 * * *', function () {
            client.messages.create({
                to: `${req.body.number}`,
                from: '+12407166198',
                body: `Visit our page for today's lunch specials for Daves Sushi! https://dine-amite.herokuapp.com/`
            });
            console.log(`daily Dave Sushi text sent to ${req.body.number}`)
            res.json("User has signed up for Daves Sushi text alerts")
        });
        console.log(task)
    } else {
        res.json("Message not sent, not logged in")
    }
})

app.post("/stopText", verifyToken, (req, res) => {
    console.log(task)
    console.log(req.body)
    task[req.body.number].destroy();
    client.messages.create({
        to: `${req.body.number}`,
        from: '+12407166198',
        body: `You have successfully unsubscribed from Dine-amite text alerts :'(`
    });
})

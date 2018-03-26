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

var client = new twilio(`${process.env.TW_SID}`, `${process.env.TW_TOKEN}`);

app.use(express.static(path.join(__dirname, "build")));
app.use(bodyParser.json({ type: 'application/json' }));
app.use(bodyParser.urlencoded({ extended: true }));

var db;
var task = [];

// Middleware function to check if the user has a valid token stored locally
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

// Only has the server listening if it can successfully connect to the database
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

app.post('/subscribeToPlace', verifyToken, (req, res) => {
    //Push the "place" onto the array of places in the DB
    db.collection('users').update(
        { username: req.body.username },
        {
            $addToSet:
                {
                    subscriptions: req.body.place
                }
        }, (err, result) => {
            if (err) {
                res.json(err);
            }
        });
    // Text user that they have subscribed
    db.collection("users").find({ username: req.body.username }).toArray((err, user) => {
        client.messages.create({
            to: `${req.body.number}`,
            from: '+12314653515',
            body: `You have successfully signed up for daily ${req.body.place} text alerts from Dineamite!`
        });
        // Schedule reoccuring daily texts
        // req.body.time is a string of the correct time, however it errorsif it isn't a string
        task[req.body.number] = cron.schedule("30 11 * * *", function () {
            client.messages.create({
                to: `${req.body.number}`,
                from: '+12314653515',
                body: `Visit our page for today's lunch specials for ${req.body.place}! https://dine-amite.herokuapp.com/`
            });
        });
        db.collection("users").find({ username: req.body.username }).toArray((err, user1) => {
            if (err) {
                console.log(err);
            }
            res.json(user1[0]);
        })
    })
});

app.post("/sendListItem", verifyToken, (req, res) => {
    // Push the string of specials info onto the array in the DB
    db.collection("users").update(
        { number: req.body.number },
        {
            $addToSet: {
                [req.body.item.className]: req.body.item.children
            }
        }
    )
    // Send the entire user object back to the front-end
    db.collection("users").find({ number: req.body.number }).toArray((err, user) => {
        res.json({
            user: user[0]
        })
    })
})

app.post("/removeListItem", verifyToken, (req, res) => {
    // Pulls the string of specials info off the array in the DB
    db.collection("users").update(
        { number: req.body.number },
        {
            $pull: {
                [req.body.item.className]: req.body.item.children

            }
        }
    )
    // Send back the entire user object back to the front-end
    db.collection("users").find({ number: req.body.number }).toArray((err, user) => {
        res.json({
            user: user[0]
        })
    })
})

app.post("/signInData", (req, res) => {
    db.collection("users").find({ username: req.body.username }).toArray((err, user) => {
        if (!user.length) {
            res.json({
                message: "Login unsuccessfull"
            });
        } else if (err) {
            res.json({
                message: "Login unsuccessfull"
            });
        } else {
            // Un-hash the password to verify login
            bcrypt.compare(req.body.password, user[0].password, function (err, resolve) {
                //res == true
                if (resolve === true) {
                    // Upon successful login, assigns the user a token
                    var token = jwt.sign(req.body.username, ('Secret'), {
                    });
                    res.json({
                        message: "Login successful!",
                        myToken: token,
                        user: user[0],
                        item: user
                    });
                    console.log(`Sign in successful from ${req.body.username}`)
                } else if (resolve === false) {
                    res.json({
                        message: "Login failed!",
                    })
                }
            });
        }
    })
});

app.post('/signUpData', (req, res) => {
    req.body.number = `+1${req.body.number}`
    if (req.body.username.length && req.body.password.length && req.body.number.length) {
        db.collection('users').find({ username: req.body.username }).toArray((err, user) => {
            db.collection('users').find({ number: req.body.number }).toArray((err, user1) => {
                if (user1.length) {
                    res.json('This number already exists')
                } else if (user.length) {
                    res.json('This username already exists')
                } else {
                    if (req.body.number.length === 12) {
                        bcrypt.hash(req.body.password, saltRounds, function (err, hash) {
                            db.collection('users').save({
                                username: req.body.username,
                                password: hash,
                                number: req.body.number,
                                subscriptions: [],
                                everyweekday: [],
                                mon: [],
                                tues: [],
                                weds: [],
                                thurs: [],
                                fri: [],
                                sat: [],
                                sun: [],
                                everyDay: [],
                            }, (err, result) => {
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
                }
            })
        })
    } else {
        res.json('Error: username or password can\'t be blank')
    }
});

app.post('/signUpBiz', (req, res) => {
    console.log(req.body)
    if (req.body.email.length && req.body.password.length) {
        db.collection('businessFoodData').find({ email: req.body.email }).toArray((err, dataMatch) => {
            if (!dataMatch.length) {
                // req.body.number = `+1${req.body.number}`
                bcrypt.hash(req.body.password, saltRounds, function (err, hash) {
                    // Store hashed password into the DB
                    db.collection('businessFoodData').update(
                        { "_id": "places" },
                        {
                            $push:
                                {
                                    places: {
                                        url: req.body.facebookUrl,
                                        name:req.body.name,
                                        links:{
                                            company:req.body.company,
                                            review:req.body.review
                                        },
                                        comments:req.body.comments
                                    }
                                }
                        }, (err, result) => {
                            if (err) {
                                res.json("Failed")
                                return console.log(err);
                            } else {
                                db.collection("businessFoodData").find({ "_id": "places" }).toArray((err, user) => {
                                    res.json({
                                        user: user[0],
                                        message: 'Business sign up was successfull!'
                                    })
                                })
                                console.log('new business saved to database');
                            }
                        });
                });
            } else {
                res.json('This email is already registered')
            }
        })
    } else {
        res.json('Error: email or password can\'t be blank')
    }
});

app.get("/getData", (req, res)=>{
    db.collection("businessFoodData").find({ "_id": "places" }).toArray((err, user) => {
        res.json({
            user:user[0]
        })
    })
})

app.post("/stopText", verifyToken, (req, res) => {
    // Resets the "subsriptions" array to an empty array
    db.collection('users').update(
        { username: req.body.username },
        {
            $set:
                {
                    subscriptions: []
                }
        }, (err, result) => {
        });
    db.collection("users").find({ username: req.body.username }).toArray((err, user2) => {
        res.json({
            user: user2[0],
            message: 'You have successfully unsubscribed from all text alerts!'
        })
    })
    // Delete the scheduled texts
    delete task[req.body.number]
    console.log(`task destroy success for ${req.body.username}:${req.body.number}`)
    client.messages.create({
        to: `${req.body.number}`,
        from: '+12314653515',
        body: `You have successfully unsubscribed from Dine-amite text alerts :'(`
    });

})

app.post("/testText", verifyToken, (req, res) => {
    console.log(req.body)
    if (req.body.number.length) {
        // Sends the user a test SMS
        client.messages.create({
            to: `${req.body.number}`,
            from: '+12314653515',
            body: 'This is a test SMS from Dineamite!'
        });
    } else {
        res.json("Message not sent, not logged in")
    }
})

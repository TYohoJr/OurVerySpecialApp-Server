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
            from: '+12407166198',
            body: 'You have successfully signed up for daily Town and Country text alerts from Dineamite!'
        });
        // Schedule reoccuring daily texts
        task[req.body.number] = cron.schedule('30 11 * * *', function () {
            client.messages.create({
                to: `${req.body.number}`,
                from: '+12407166198',
                body: `Visit our page for today's lunch specials for Town and Country! https://dine-amite.herokuapp.com/`
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
                items: req.body.item
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
                items: req.body.item
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
    console.log(req.body)
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
    if (req.body.username.length && req.body.password.length) {
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
                                items: [],
                                subscriptions:[]
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
    if (req.body.username.length && req.body.password.length) {
        db.collection('users').find({ username: req.body.username }).toArray((err, dataMatch) => {
            if (!dataMatch.length) {
                req.body.number = `+1${req.body.number}`
                bcrypt.hash(req.body.password, saltRounds, function (err, hash) {
                    // Store hashed password into the DB
                    db.collection('users').save({
                        bizusername: req.body.username,
                        password: hash,
                        email: req.body.email,
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
                res.json('This username already exists')
            }
        })
    } else {
        res.json('Error: username or password can\'t be blank')
    }
});

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
            console.log(result)
        });
    db.collection("users").find({ username: req.body.username }).toArray((err, user2) => {
        console.log('sendin data')
        res.json({
            user: user2[0]
        })
    })
    // Delete the scheduled texts
    delete task[req.body.number]
    console.log(`task destroy success for ${req.body.username}:${req.body.number}`)
    client.messages.create({
        to: `${req.body.number}`,
        from: '+12407166198',
        body: `You have successfully unsubscribed from Dine-amite text alerts :'(`
    });

})

app.post("/testText", verifyToken, (req, res) => {
    if (req.body.number.length) {
        // Sends the user a test SMS
        client.messages.create({
            to: `${req.body.number}`,
            from: '+12407166198',
            body: 'This is a test SMS from Dineamite!'
        });
    } else {
        res.json("Message not sent, not logged in")
    }
})

// app.post("/textTnC", verifyToken, (req, res) => {
//     db.collection('users').update(
//         { username: req.body.username },
//         {
//             $addToSet:
//                 {
//                     subscriptions: req.body.place
//                 }
//         }, (err, result) => {
//         });
//     db.collection("users").find({ username: req.body.username }).toArray((err, user) => {
//         if (req.body.number.length) {
//             client.messages.create({
//                 to: `${req.body.number}`,
//                 from: '+12407166198',
//                 body: 'You have successfully signed up for daily Town and Country text alerts from Dineamite!'
//             });
//             task[req.body.number] = cron.schedule('30 11 * * *', function () {
//                 client.messages.create({
//                     to: `${req.body.number}`,
//                     from: '+12407166198',
//                     body: `Visit our page for today's lunch specials for Town and Country! https://dine-amite.herokuapp.com/`
//                 });
//             });
//             db.collection("users").find({ username: req.body.username }).toArray((err, user1) => {
//                 res.json({
//                     message: "User has signed up for TnC text alerts",
//                     number: user1[0].number,
//                     tncSubscribe: user1[0].tncSubscribe,
//                     heebsSubscribe: user1[0].heebsSubscribe,
//                     davesSubscribe: user1[0].davesSubscribe,
//                     fillingSubscribe: user1[0].fillingSubscribe,
//                     zebraSubscribe: user1[0].zebraSubscribe,
//                     rialtoSubscribe: user1[0].rialtoSubscribe
//                 })
//             })
//         } else {
//             res.json("Message not sent, not logged in")
//         }
//     })
// })

// app.post("/textHeebs", verifyToken, (req, res) => {
//     db.collection('users').update(
//         { username: req.body.username },
//         {
//             $set:
//                 {
//                     heebsSubscribe: "Heebs"
//                 }
//         }, (err, result) => {
//         });
//     if (req.body.number.length) {
//         client.messages.create({
//             to: `${req.body.number}`,
//             from: '+12407166198',
//             body: 'You have successfully signed up for daily Heebs text alerts from Dineamite!'
//         });
//         task[req.body.number] = cron.schedule('0 10 * * *', function () {
//             client.messages.create({
//                 to: `${req.body.number}`,
//                 from: '+12407166198',
//                 body: `Visit our page for today's lunch specials for Heebs! https://dine-amite.herokuapp.com/`
//             });
//         });
//         db.collection("users").find({ username: req.body.username }).toArray((err, user1) => {
//             res.json({
//                 message: "User has signed up for Heebs text alerts",
//                 number: user1[0].number,
//                 tncSubscribe: user1[0].tncSubscribe,
//                 heebsSubscribe: user1[0].heebsSubscribe,
//                 davesSubscribe: user1[0].davesSubscribe,
//                 fillingSubscribe: user1[0].fillingSubscribe,
//                 zebraSubscribe: user1[0].zebraSubscribe,
//                 rialtoSubscribe: user1[0].rialtoSubscribe
//             })
//         })
//     } else {
//         res.json("Message not sent, not logged in")
//     }
// })

// app.post("/textDaves", verifyToken, (req, res) => {
//     db.collection('users').update(
//         { username: req.body.username },
//         {
//             $set:
//                 {
//                     davesSubscribe: "Daves Sushi"
//                 }
//         }, (err, result) => {
//         });
//     if (req.body.number.length) {
//         client.messages.create({
//             to: `${req.body.number}`,
//             from: '+12407166198',
//             body: 'You have successfully signed up for daily Daves Sushi text alerts from Dineamite!'
//         });
//         task[req.body.number] = cron.schedule('0 13 * * *', function () {
//             client.messages.create({
//                 to: `${req.body.number}`,
//                 from: '+12407166198',
//                 body: `Visit our page for today's lunch specials for Daves Sushi! https://dine-amite.herokuapp.com/`
//             });
//         });
//         db.collection("users").find({ username: req.body.username }).toArray((err, user1) => {
//             res.json({
//                 message: "User has signed up for TnC text alerts",
//                 number: user1[0].number,
//                 tncSubscribe: user1[0].tncSubscribe,
//                 heebsSubscribe: user1[0].heebsSubscribe,
//                 davesSubscribe: user1[0].davesSubscribe,
//                 fillingSubscribe: user1[0].fillingSubscribe,
//                 zebraSubscribe: user1[0].zebraSubscribe,
//                 rialtoSubscribe: user1[0].rialtoSubscribe
//             })
//         })
//     } else {
//         res.json("Message not sent, not logged in")
//     }
// })

// app.post("/textFilling", verifyToken, (req, res) => {
//     db.collection('users').update(
//         { username: req.body.username },
//         {
//             $set:
//                 {
//                     fillingSubscribe: "Filling Station"
//                 }
//         }, (err, result) => {
//         });
//     if (req.body.number.length) {
//         client.messages.create({
//             to: `${req.body.number}`,
//             from: '+12407166198',
//             body: 'You have successfully signed up for daily Filling Station text alerts from Dineamite!'
//         });
//         task[req.body.number] = cron.schedule('0 11 * * *', function () {
//             client.messages.create({
//                 to: `${req.body.number}`,
//                 from: '+12407166198',
//                 body: `Visit our page for info on The Filling Station! https://dine-amite.herokuapp.com/`
//             });
//         });
//         db.collection("users").find({ username: req.body.username }).toArray((err, user1) => {
//             res.json({
//                 message: "User has signed up for Filling Station text alerts",
//                 number: user1[0].number,
//                 tncSubscribe: user1[0].tncSubscribe,
//                 heebsSubscribe: user1[0].heebsSubscribe,
//                 davesSubscribe: user1[0].davesSubscribe,
//                 fillingSubscribe: user1[0].fillingSubscribe,
//                 zebraSubscribe: user1[0].zebraSubscribe,
//                 rialtoSubscribe: user1[0].rialtoSubscribe
//             })
//         })
//     } else {
//         res.json("Message not sent, not logged in")
//     }
// })

// app.post("/textZebra", verifyToken, (req, res) => {
//     db.collection('users').update(
//         { username: req.body.username },
//         {
//             $set:
//                 {
//                     zebraSubscribe: "Zebra Lounge"
//                 }
//         }, (err, result) => {
//         });
//     if (req.body.number.length) {
//         client.messages.create({
//             to: `${req.body.number}`,
//             from: '+12407166198',
//             body: 'You have successfully signed up for daily Zebra Lounge text alerts from Dineamite!'
//         });
//         task[req.body.number] = cron.schedule('0 11 * * *', function () {
//             client.messages.create({
//                 to: `${req.body.number}`,
//                 from: '+12407166198',
//                 body: `Visit our page for info on The Zebra Lounge! https://dine-amite.herokuapp.com/`
//             });
//         });
//         db.collection("users").find({ username: req.body.username }).toArray((err, user1) => {
//             res.json({
//                 message: "User has signed up for Zebra Lounge text alerts",
//                 number: user1[0].number,
//                 tncSubscribe: user1[0].tncSubscribe,
//                 heebsSubscribe: user1[0].heebsSubscribe,
//                 davesSubscribe: user1[0].davesSubscribe,
//                 fillingSubscribe: user1[0].fillingSubscribe,
//                 zebraSubscribe: user1[0].zebraSubscribe,
//                 rialtoSubscribe: user1[0].rialtoSubscribe
//             })
//         })
//     } else {
//         res.json("Message not sent, not logged in")
//     }
// })

// app.post("/textRialto", verifyToken, (req, res) => {
//     db.collection('users').update(
//         { username: req.body.username },
//         {
//             $set:
//                 {
//                     rialtoSubscribe: "The Rialto"
//                 }
//         }, (err, result) => {
//         });
//     if (req.body.number.length) {
//         client.messages.create({
//             to: `${req.body.number}`,
//             from: '+12407166198',
//             body: 'You have successfully signed up for daily The Rialto text alerts from Dineamite!'
//         });
//         task[req.body.number] = cron.schedule('0 11 * * *', function () {
//             client.messages.create({
//                 to: `${req.body.number}`,
//                 from: '+12407166198',
//                 body: `Visit our page for info on The Rialto! https://dine-amite.herokuapp.com/`
//             });
//         });
//         db.collection("users").find({ username: req.body.username }).toArray((err, user1) => {
//             res.json({
//                 message: "User has signed up for The Rialto text alerts",
//                 number: user1[0].number,
//                 tncSubscribe: user1[0].tncSubscribe,
//                 heebsSubscribe: user1[0].heebsSubscribe,
//                 davesSubscribe: user1[0].davesSubscribe,
//                 fillingSubscribe: user1[0].fillingSubscribe,
//                 zebraSubscribe: user1[0].zebraSubscribe,
//                 rialtoSubscribe: user1[0].rialtoSubscribe
//             })
//         })
//     } else {
//         res.json("Message not sent, not logged in")
//     }
// })
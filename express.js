var bodyParser = require('body-parser');
var express = require("express");
var app = express();
var MongoClient = require('mongodb').MongoClient;
var bcrypt = require('bcrypt');
const saltRounds = 10;
var jwt = require('jsonwebtoken');
var path = require('path')

var twilio = require('twilio');
var client = new twilio('AC59b806deb1c33e9ad8e6e4f9265c9f63', '05dd7f6c2262b9995c9f97b8c3904424');



app.use(bodyParser.json({ type: 'application/json' }));
app.use(bodyParser.urlencoded({ extended: true }));

var db;

// function verifyToken(req, res, next) {
//     var token = req.body.token;
//     if (token) {
//         jwt.verify(token, "Secret", (err, decode) => {
//             if (err) {
//                 res.send("Wrong token")
//             } else {
//                 res.locals.decode = decode
//                 next();
//             }
//         })
//     } else {
//         res.send("No token")
//     }
// }

MongoClient.connect(`mongodb://localhost:27017/moby`, (err, client) => {
    if (err) return console.log(err)
    db = client.db("moby") // whatever your database name is
    app.listen(8080, () => {
        console.log("listening on 8080")
    })
})

app.post("/text", (req, res) =>{
    console.log(req.body)
    client.messages.create({
        to: `${req.body.number}`,
        from: '+12407166198',
        body: 'test6'
      });
      
    res.send("index.html")
})

app.post("/signInData", (req, res) => {
    db.collection("users").find({ username: req.body.username }).toArray((err, user) => {

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
                    number: user[0].number
                });
            } else if(resolve === false){
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
                bcrypt.hash(req.body.password, saltRounds, function (err, hash) {
                    // Store hash in your password DB.
                    db.collection('users').save({ username: req.body.username, password: hash, number:req.body.number }, (err, result) => {
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
"use strict";
/* 
 * GRUPO 606 - Marcelino Pérez y Mario Rodríguez
 */

const express = require("express");
const mysql = require("mysql");
const path = require("path");
const bodyParser = require("body-parser");
const config = require("./config");
const daoUsers = require("./dao_users");
const daoFriends = require("./dao_friends");
const daoQuestions = require("./dao_questions");
const daoImages = require("./dao_images");
const mysqlSession = require("express-mysql-session");
const session = require("express-session");
const multer = require("multer");
const MySQLStore = mysqlSession(session);

const expressValidator = require("express-validator");

const ficherosEstaticos = path.join(__dirname, "public");
const app = express();
const uploadProfilePicture = multer({ dest: path.join(__dirname, "profile_imgs") });
const uploadImage = multer({dest: path.join(__dirname, "images")});
//siempre debe estar
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const sessionStore = new MySQLStore({
    host:  config.mysqlConfig.host, 
    user:  config.mysqlConfig.user,
    password: config.mysqlConfig.password,
    database: config.mysqlConfig.database,
});

let pool = mysql.createPool({
    database: config.mysqlConfig.database,
    host: config.mysqlConfig.host,
    user: config.mysqlConfig.user,
    password: config.mysqlConfig.password
});

const middlewareSession = session({
    saveUninitialized: false,
    secret: "foobar34",
    resave: false,
    store: sessionStore
});


app.use(express.static(ficherosEstaticos));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(middlewareSession);
app.use(expressValidator({
    customValidators: {
        //comprobamos que param no es solo espacios en blanco
        whiteSpace: function (param) {
            return param.trim().length > 0;
        } ,
        min2ans: function(param) {
            let num = param.split("\n");
            return num.length >= 2;
        },
    }
}));

//app.use del flash
app.use((request, response, next) => {
    response.setFlash = (str) => {
        request.session.flashMessage = str;
    }
    response.locals.getFlash = () => {
        let mensaje = request.session.flashMessage;
        delete request.session.flashMessage;
        return mensaje;
    }
    next();
});

let daoU = new daoUsers.DAOUsers(pool);
let daoF = new daoFriends.DAOFriends(pool);
let daoQ = new daoQuestions.DAOQuestions(pool);
let daoI = new daoImages.DAOImages(pool);

app.listen(config.port, (err) => {
    if (err) {
        console.error("No se pudo inicializar el servidor: " + err.message);
    } else {
        console.log("Servidor arrancado en el puerto " + config.port);
    }
});

function identificacionRequerida(request, response, next) {

    if (request.session.currentUserId !== undefined) {
        response.locals.user_id = request.session.currentUserId;
        next();
    } else {
        response.status(300);
        response.redirect("/login.html");
        response.end();
    }
}

app.get("/", (request, response) => {
    response.status(300);
    response.redirect("/login.html");
    response.end();
});


app.get("/login.html", (request, response) => {
    //Si el usuario esta logeado ya en el sistema, impedimos que vaya a la vista login
    if (request.session.currentUserId === undefined) {
        response.status(200);
        response.render("login", { errores: [], usuario: {}, email: null });
        response.end();
    } else {
        response.status(300);
        response.redirect("/my_profile");
        response.end();
    }
});

app.post("/login", (request, response) => {
    request.checkBody("email", "Dirección de correo vacía").notEmpty();
    request.checkBody("email", "Dirección de correo no válida").isEmail();
    request.checkBody("pass", "Contraseña vacía").notEmpty();
    request.checkBody("pass", "La contraseña debe tener entre 4 y 15 caracteres").isLength({ min: 4, max: 15 });
    request.getValidationResult().then((result) => {
        if (result.isEmpty()) {
            daoU.isUserCorrect(request.body.email, request.body.pass, (err, id) => {
                if (err) {
                    response.status(300);
                    response.redirect("/login.html");
                    response.end();
                }
                else {
                    if (id > 0) {
                        request.session.currentUserId = id;
                        request.session.currentUserEmail = request.body.email;
                        response.status(300);
                        response.redirect("/my_profile");
                        response.end();
                    }
                    else {
                        response.setFlash("Dirección de correo electronico y/o contraseña no válidos");
                        response.status(300);
                        response.redirect("/login.html");
                        response.end();
                    }
                }
            })
        } else {
            var usuarioIncorrecto = {
                pass: request.body.pass,
                email: request.body.email,
            };
            let email;
            if(!result.mapped().email) {
                email = request.body.email;
            }
            response.status(200);
            response.render("login", { errores: result.mapped(), usuario: usuarioIncorrecto, email: email });
            response.end();
        }
    });
});

app.get("/logout", (request, response) => {
    request.session.destroy();
    response.status(300);
    response.redirect("/login.html");
    response.end();
});
app.get("/imagenUsuario/:id", (request, response) => {
    response.sendFile(path.join(__dirname, "profile_imgs", request.params.id));
    request.session.userImg = request.params.id;
});
app.get("/imagenUsuario", (request, response) => {
    response.status(200);
    response.sendFile(__dirname + '/public/img/NoProfile.png');
    response.end();
});

app.get("/new_user.html", (request, response) => {
    response.status(200);
    response.render("new_user", { errores: [], usuario: {}, date: {} });
    response.end();
})

app.post("/new_user", uploadProfilePicture.single("uploadedfile"), (request, response) => {
    //request.checkBody("name", "Nombre de usuario no válido").matches(/^[A-Z0-9]*$/i);
    request.checkBody("name", "Nombre de usuario vacío").notEmpty();
    request.checkBody("name", "Nombre no puede ser menor que 1 ni mayor que 50 caracteres").isLength({ min: 0, max: 50 });
    request.checkBody("name", "Nombre no puede ser espacio en blanco").whiteSpace();
    request.checkBody("email", "Dirección de correo no válida").isEmail();
    request.checkBody("email", "Dirección de correo vacía").notEmpty();
    request.checkBody("gender", "Sexo no seleccionado").notEmpty();
    request.checkBody("password", "La contraseña debe tener entre 4 y 15 caracteres").isLength({ min: 4, max: 15 });
    request.checkBody("password", "Contraseña vacía").notEmpty();
    request.getValidationResult().then((result) => {
        if (result.isEmpty()) {
            daoU.userExist(request.body.email, (err, email) => {
                if (err) {
                    console.error(err);
                }
                else {
                    if (email !== request.body.email) {
                        let imgName;
                        if (request.file) { // Si se ha subido un fichero
                            imgName = request.file.filename;
                        }
                        if (request.body.date === '') {
                            request.body.date = null;
                        }
                        daoU.insertUser(request.body.email, request.body.password, request.body.name,
                            request.body.gender, request.body.date, imgName, (err, id) => {
                                if (err) {
                                    console.error(err);
                                } else {
                                    request.session.currentUserId = id;
                                    request.session.currentUserEmail = request.body.email;
                                    response.status(300);
                                    response.redirect("/my_profile");
                                    response.end();
                                }
                            })
                    }
                    else {
                        response.setFlash("Dirección de correo electrónico en uso");
                        response.status(300);
                        response.redirect("/new_user.html");
                        response.end();
                    }
                }
            })
        } else {
            var usuarioIncorrecto = {
                email: request.body.email,
                password: request.body.password,
                name: request.body.name,
                gender: request.body.gender,
            };
            var userDate = {
                email: null,
                name: null
            }
            if (!result.mapped().email) {
                userDate.email = request.body.email;
            }
            if (!result.mapped().name) {
                userDate.name = request.body.name;
            }
            response.status(200);
            response.render("new_user", { errores: result.mapped(), usuario: usuarioIncorrecto, date: userDate });
            response.end();
        }
    });
})

app.get("/my_profile", identificacionRequerida, (request, response) => {
    daoU.getUserData(request.session.currentUserId, (err, usr) => {
        if (err) {
            console.error(err);
        } else {
            daoI.getUserImages(request.session.currentUserId,(err,img)=>{
                if (err) {
                    console.error(err);
                } else {
                    response.status(200);
                    response.render("my_profile", { user: usr, images:img });
                    response.end();
                }
            })
        }
        
    });
});


app.get("/modify_profile", identificacionRequerida, (request, response) => {
    daoU.getUserData(request.session.currentUserId, (err, usr) => {
        if (err) {
            console.error(err);
        } else {
            response.status(200);
            response.render("modify_profile", { user: usr, errores: [], usuario: {}, date: {} });
            response.end();
        }
    });
});

app.post("/modify", identificacionRequerida, uploadProfilePicture.single("uploadedfile"), (request, response) => {
    request.checkBody("name", "Nombre de usuario vacío").notEmpty();
    request.checkBody("name", "Nombre no puede ser menor que 1 ni mayor que 50 caracteres").isLength({ min: 0, max: 50 });
    request.checkBody("name", "Nombre no puede ser espacio en blanco").whiteSpace();
    request.checkBody("email", "Dirección de correo no válida").isEmail();
    request.checkBody("email", "Dirección de correo vacía").notEmpty();
    request.checkBody("gender", "Sexo no seleccionado").notEmpty();
    request.checkBody("password", "La contraseña debe tener entre 4 y 15 caracteres").isLength({ min: 4, max: 15 });
    request.checkBody("password", "Contraseña vacía").notEmpty();
    request.getValidationResult().then((result) => {
        if (result.isEmpty()) {
            daoU.userExist(request.body.email, (err, email) => {
                if (err) {
                    console.error(err);
                }
                else {
                    //Comprobamos que el correo sea el mismo, o si se ha cambiado, que no exista ya en la base de datos
                    if (request.session.currentUserEmail === request.body.email || email !== request.body.email) {
                        var img;
                        if (request.file) { // Si se ha subido un fichero
                            img = request.file.filename;
                        } else {
                            console.log("No hay cambio en imagen");
                            img = request.session.userImg;
                        }
                        if (request.body.date === '') {
                            request.body.date = null;
                        }
                        daoU.modifyUser(request.session.currentUserId, request.body.email, request.body.password, request.body.name,
                            request.body.gender, request.body.date, img, (err) => {
                                if (err) {
                                    console.error(err);
                                } else {
                                    //Cambiamos las cookies de sesion si hemos cambiado el email
                                    if (request.session.currentUserEmail !== request.body.email) {
                                        request.session.currentUserEmail = request.body.email;
                                    }
                                    response.setFlash("Modificaciones guardadas");
                                    response.status(300);
                                    response.redirect("/my_profile");
                                    response.end();
                                }
                            });
                    }
                    else {
                        response.setFlash("Dirección de correo electrónico en uso");
                        response.status(300);
                        response.redirect("/modify_profile");
                        response.end();
                    }
                }
            });
        } else {
            var usuarioIncorrecto = {
                email: request.body.email,
                password: request.body.password,
                name: request.body.name,
                gender: request.body.gender,
            };
            daoU.getUserData(request.session.currentUserId, (err, usr) => {
                if (err) {
                    console.error(err);
                } else {
                    response.status(200);
                    response.render("modify_profile", { user: usr, errores: result.mapped(), usuario: usuarioIncorrecto });
                    response.end();
                }
            });
        }
    });
});

app.get("/friends", identificacionRequerida, (request, response) => {
    daoU.getUserData(request.session.currentUserId, (err, usr) => {
        if (err) {
            console.error(err);
        } else {
            daoF.getFriendList(request.session.currentUserId, (err, frd) => {
                if (err) { console.error(err); }
                else {
                    response.status(200);
                    response.render("friends", {
                        user: usr, friends: frd, id: request.session.currentUserId,
                        errores: [], usuario: {}
                    });
                    response.end();
                }
            })
        }
    });
})

app.post("/discardFriend", identificacionRequerida, (request, response) => {

    daoF.discardFriend(request.body.friendId, request.session.currentUserId, (err => {
        if (err) { console.error(err); }
        else {
            response.setFlash("Petición rechazada");
            response.status(300);
            response.redirect("/friends");
            response.end();
        }
    }))
})

app.post("/addFriend", identificacionRequerida, (request, response) => {
    daoF.addFriend(request.body.friendId, request.session.currentUserId, (err => {
        if (err) { console.error(err); }
        else {
            response.setFlash("Petición aceptada");
            response.status(300);
            response.redirect("/friends");
            response.end();
        }
    })
    )
})

app.get("/friendImg", identificacionRequerida, (request, response) => {
    let img;
    img = request.body.userId;

    if (img === null || img === '' || img === undefined) {
        response.status(200);
        response.sendFile(__dirname + '/public/img/NoProfile.png');
    } else {
        response.sendFile(__dirname + '/profile_imgs/' + img);
    }
    request.session.userImg = img;
})

app.get("/searchName", identificacionRequerida, (request, response) => {

    request.checkQuery("nombre", "Debe introducir al menos un carácter para realizar la búsqueda").notEmpty();
    request.checkQuery("nombre", "La búsqueda no puede ser menor que 1 ni mayor que 50 caracteres").isLength({ min: 0, max: 50 });
    request.getValidationResult().then((result) => {
        if (result.isEmpty()) {
            daoF.searchByName(request.query.nombre, (err, list) => {
                if (err) {
                    console.error(err);
                }
                else {
                    if (list.length !== 0) {
                        daoF.getFriendList(request.session.currentUserId, (err, frd) => {
                            if (err) {
                                console.error(err);
                            } else {
                                daoU.getUserData(request.session.currentUserId, (err, usr) => {
                                    if (err) {
                                        console.error(err);
                                    } else {
                                        frd.forEach(friend => {
                                            list.forEach(user => {
                                                if (friend.user_id === user.user_id) {
                                                    user.tieneRelacion = friend.status;
                                                }
                                            })
                                        })
                                        response.status(200);
                                        response.render("search", {
                                            user: usr, list: list,
                                            id: request.session.currentUserId, nombre: request.query.nombre
                                        });
                                        response.end();
                                    }
                                })
                            }
                        })
                    } else {
                        //Mensaje flash aqui
                        response.setFlash(`Ningún resultado para: ${request.query.nombre} `);
                        response.status(300);
                        response.redirect("/friends");
                        response.end();
                    }
                }
            }
            )
        } else {
            var busquedaIncorrecta = {
                busqueda: request.query.nombre,
            };
            daoU.getUserData(request.session.currentUserId, (err, usr) => {
                if (err) {
                    console.error(err);
                } else {
                    daoF.getFriendList(request.session.currentUserId, (err, frd) => {
                        if (err) {
                            console.error(err);
                        } else {
                            response.status(200);
                            response.render("friends", {
                                user: usr, friends: frd, id: request.session.currentUserId,
                                errores: result.mapped(), busqueda: busquedaIncorrecta
                            });
                            response.end();
                        }
                    })
                }
            });
        }
    })
})

app.post("/sendFriendRequest", identificacionRequerida, (request, response) => {

    daoF.sendFriendship(request.body.friendId, request.session.currentUserId, (err) => {
        if (err) {
            console.error(err);
        }
        else {
            response.setFlash("Petición enviada");
            response.status(300);
            response.redirect("/friends");
            response.end();
        }
    })
})

app.get("/friendProfile", identificacionRequerida, (request, response) => {

    daoU.getUserData(request.session.currentUserId, (err, usr) => {
        if (err) {
            console.error(err);
        }
        else {
            /*getStatusFriend devuelve tanto la información del amigo como 
            el estado con el usuario actualmente logeado */
            daoF.getStatusFriend(request.query.friendId, request.session.currentUserId, (err, frd) => {
                if (err) { console.error(err); }
                else{
                    daoI.getUserImages(request.query.friendId,(err,img)=>{
                        if (err) {
                            console.error(err);
                        } else {
                            /*Para controlar que si el usuario logeado modifica la url, se compruebe
                             * que el usuario id del amigo/persona al que quiere ir existe o no*/
                            if (frd !== undefined) {
                                response.render("friend_profile", {
                                user: usr,
                                friend: frd,
                                images:img,
                            });
                            } else {
                                console.error("Este usuario no existe");
                                response.setFlash("Este usuario no existe");
                                response.status(300);
                                response.redirect("/friends");
                                response.end();
                            }
                        }
                })
                
            }})
        }
    });
})

app.post("/deleteFriend", identificacionRequerida, (request, response) => {
    daoF.discardFriend(request.body.friendId, request.session.currentUserId, (err => {
        if (err) { console.error(err); }
        else {
            response.setFlash("Amigo eliminado");
            response.status(300);
            response.redirect("/friends");
            response.end();
        }
    }))
})

app.get("/questions", identificacionRequerida, (request, response) => {
    daoU.getUserData(request.session.currentUserId, (err, usr) => {
        if (err) {
            console.error(err);
        } else {
            daoQ.getQuestions((err, qst) => {
                if (err) {
                    console.error(err);
                }
                else {
                    //Maximo de preguntas a mostrar
                    response.status(200);
                    response.render("questions", { user: usr, questions: qst });
                    response.end();
                }
            })
        }
    });
})

app.get("/addQuestion", identificacionRequerida, (request, response) => {
    daoU.getUserData(request.session.currentUserId, (err, usr) => {
        if (err) {
            console.error(err);
        } else {
            response.status(200);
            response.render("add_questions", { user: usr, errores: [], usuario: {} });
            response.end();
        }
    });
})

app.post("/addQuestion", identificacionRequerida, (request, response) => {

    let allAnswers = request.body.answers;
    let answer = allAnswers.split("\n");

    answer.forEach((a,index,array)=> {
        if(a.trim().length === 0) {
            array.splice(index, 1);
        }
    })
    let num = answer.length;
    // HACER VALIDACIÓN!!!
    request.checkBody("question", "La pregunta está vacía").notEmpty();
    request.checkBody("answers", "Respuestas está vacío").notEmpty();
    request.checkBody("question", "La pregunta no puede ser espacio en blanco").whiteSpace();
    request.checkBody("answers", "Las respuestas no pueden ser espacio en blanco").whiteSpace();
    request.checkBody("answers", "Debes introducir al menos dos respuestas").min2ans();
    request.getValidationResult().then((result) => {
        if (result.isEmpty() && num >= 2) {
            daoQ.addQuestion(request.body.question, answer, num, (err) => {
                if (err) {
                    console.error(err);
                } else {
                    daoU.getUserData(request.session.currentUserId, (err, usr) => {
                        if (err) {
                            console.error(err);
                        } else {
                            if (err) { console.error(err); }
                            else {
                                response.status(300);
                                response.redirect("/questions");
                                response.end();
                            }
                        }
                    });
                }
            })
        }
        else {
            var addQuestIncorrecto = {
                question: request.body.question,
                answers: request.body.answers,
            };
            daoU.getUserData(request.session.currentUserId, (err, usr) => {
                if (err) {
                    console.error(err);
                } else {
                    response.status(200);
                    if(num < 2)
                        response.setFlash("Debes introducir al menos dos respuestas no vacías");
                        response.render("add_questions", {
                            user: usr, errores: result.mapped(), usuario: addQuestIncorrecto
                            });
                        response.end();
                }
            });
        }
    })
})

app.get("/quest_menu", identificacionRequerida, (request, response) => {

    response.status(200);
    let questionId = request.query.question_id;
    daoU.getUserData(request.session.currentUserId, (err, usr) => {
        if (err) {
            console.error(err);
        } else {
            daoQ.getParticularQuestion(questionId, (err, qst) => {
                if (err) { console.error(err); }
                //Comprobamos que no se intente acceer por URL a una pregunta que no exista
                if (qst !== undefined) {
                    daoQ.isAnsweredByUser(request.session.currentUserId, questionId, (err, ans) => {
                        if (err) { console.error(err); }
                        else {
                            daoQ.getFriendsAnswer(request.session.currentUserId, questionId, (err, frd) => {
                                if (err) { console.error(err); }
                                else {
                                    response.status(200);
                                    response.render("quest_menu", { user: usr, quest: qst, answered: ans, friend: frd });
                                    response.end();
                                }
                            })
                        }
                    })
                } else {
                    response.status(300);
                    response.redirect("/questions");
                    response.end();
                }
            })
        }
    });

})

app.get("/ans_question", identificacionRequerida, (request, response) => {

    daoU.getUserData(request.session.currentUserId, (err, usr) => {
        if (err) {
            console.error(err);
        } else {
            daoQ.getAnswers(request.query.question_id, (err, ans) => {
                if (err) { console.error(err); }
                //Para que no explote si se modifica direccion por URL
                //OJO ans debe tener al menos una (o dos) respuesta para que esto funcione
                if (ans[0] !== undefined) {
                    response.status(200);
                    response.render("ans_question", { user: usr, answers: ans, errores: [], usuario: {} });
                    response.end();
                }
                else {
                    response.status(300);
                    response.redirect("/questions");
                    response.end();
                }
            })
        }
    });
})

app.post("/ans_question", identificacionRequerida, (request, response) => {

    let answerId = -1;
    let otherNotEmpty = true;
    if (request.body.ansId === 'on' && request.body.ansText === '') {
        otherNotEmpty = false;
    }

    //CONTROL DE VALIDACIÓN!!
    request.checkBody("ansId", "¡No has seleccionado ninguna respuesta!").notEmpty();
    request.getValidationResult().then((result) => {
        if (result.isEmpty() && otherNotEmpty) {
            daoU.getUserData(request.session.currentUserId, (err, usr) => {
                if (err) {
                    console.error(err);
                } else {
                    //BUSCAR MANERA DE NO TENER ESTE IF ELSE
                    /** Para así no tener que llamar dos veces a addUserAnswer
                     * aunqeu funciona bien
                     * newAnsId
                     */

                    //ON es lo que devuelve si no hay ningun ID pero esta seleccionado, en este caso OTRO
                    if (request.body.ansId === 'on' && request.body.ansText !== '') {
                        daoQ.addAnswer(request.body.questionId, request.body.ansText, (err, answerId) => {
                            if (err) { console.error(err); }
                            else {
                                daoQ.addUserAnswer(answerId, request.session.currentUserId, (err) => {
                                    if (err) { console.error(err); }
                                    else {
                                        response.setFlash("Respondido");
                                        response.status(300);
                                        response.redirect("/questions");
                                        response.end();
                                    }
                                })
                            }
                        })
                    }
                    else {
                        daoQ.addUserAnswer(request.body.ansId, request.session.currentUserId, (err) => {
                            if (err) { console.error(err); }
                            else {
                                response.setFlash("Respondido");
                                response.status(300);
                                response.redirect("/questions");
                                response.end();
                            }
                        })
                    }
                }
            })
        } else {
            var ansQuestError = {
                ansId: request.body.ansId,
                ansText: request.body.ansText,
                otherNotEmpty: otherNotEmpty
            };
            daoU.getUserData(request.session.currentUserId, (err, usr) => {
                if (err) {
                    console.error(err);
                } else {
                    daoQ.getAnswers(request.body.questionId, (err, ans) => {
                        if (err) { console.error(err); }
                        //Para que no explote si se modifica direccion por URL
                        //OJO ans debe tener al menos una (o dos) respuesta para que esto funcione
                        if (ans[0] !== undefined) {
                            response.setFlash("Otra respuesta no puede ser vacía");
                            response.status(200);
                            response.render("ans_question", { user: usr, answers: ans, errores: result.mapped(), usuario: ansQuestError });
                            response.end();
                        }
                        else {
                            response.status(300);
                            response.redirect("/questions");
                            response.end();
                        }
                    })
                }
            });
        }
    });
})

/**
 * Fisher-Yates algorithm
 * https://github.com/Daplie/knuth-shuffle
 * 
 * @param {*} array array to randomize
 */
function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

app.get("/ans_guess", identificacionRequerida, (request, response) => {

    let numDefault = 0;
    daoU.getUserData(request.session.currentUserId, (err, usr) => {
        if (err) { console.error(err); }
        else {
            daoQ.getParticularAnswer(request.query.friendId, request.query.question_id, (err, ansd) => {
                if (err) { console.error(err); }
                else {
                    //Tomamos el numero de respuestas que tenia la pregunta por primera vez
                    numDefault = ansd.num;
                    daoQ.pickNRandomAnswers(ansd.answer, request.query.question_id, numDefault - 1, (err, qust) => {
                        if (err) { console.error(err); }
                        else {
                            /**
                             * trueAns contiene los valores de la respuesa correcta en el mismo formato que qust (de los
                             * answers random).
                             */
                            let trueAns = { answer: ansd.ansName, answerId: ansd.answer, question: qust[0].question };
                            qust.push(trueAns);
                            //shuffle pone los valores existentes en el array en indices aleatorios
                            qust = shuffle(qust);
                            response.status(200);
                            response.render("guess_friend_question", { correct: ansd, user: usr, question: qust });
                            response.end();
                        }
                    })
                }
            })
        }
    })
})

app.post("/ans_guess", identificacionRequerida, (request, response) => {
    let correct = 0;

        if (request.body.ansId !== undefined) {
            daoU.getUserData(request.session.currentUserId, (err, usr) => {
                if (err) { console.error(err); }
                else {
                    let puntos = usr.points;
                    let text = "";
                    //Comprobamos que la respuesta correcta sea igual a la seleccionada por el usuario
                    if (request.body.ansId === request.body.correctId) {
                        correct = 1;
                        puntos = puntos + 50;
                        text = "¡Adivinado!"
                    }
                    else {
                        correct = 0;
                        text = "No has adivinado"
                    }
                    daoU.addUserPoints(request.session.currentUserId, puntos, (err) => {
                        if (err) { console.error(err); }
                        else {
                            daoQ.addGuessAnswer(request.body.ansId, request.session.currentUserId,
                                request.body.idFriend, correct, (err) => {
                                    if (err) { console.error(err); }
                                    else {
                                        response.setFlash(text);
                                        response.status(300);
                                        response.redirect("/questions");
                                        response.end();
                                    }
                                });
                        }
                    })
                }
            })
        } else {
            response.setFlash("¡No has seleccionado ninguna respuesta!");
            response.redirect("/questions");
        }
})

app.get("/upload_img", identificacionRequerida, (request, response) => {
    daoU.getUserData(request.session.currentUserId, (err, usr) => {
        if (err) {
            console.error(err);
        } else {
            response.status(200);
            response.render("upload_img", { user: usr,errores: []});
            response.end();
        }
    });
});

app.post("/add_img", identificacionRequerida,uploadImage.single("uploadedfile"),(request,response)=>{
    var img;
    let text="";

    request.checkBody("description","Descripción de la imágen vacía").notEmpty();
    request.checkBody("description", "La descripción de la imagen no puede ser un espacio en blanco").whiteSpace();
    request.getValidationResult().then((result) => {
        if (result.isEmpty() && request.file){
            //if () { // Si se ha subido un fichero
                img = request.file.filename;
                daoU.getUserData(request.session.currentUserId, (err, usr) => {
                    if (err) { console.error(err); }
                    else {
                        let puntos=usr.points;
                        daoI.addImage(request.session.currentUserId,img,request.body.description,(err)=>{
                            if(err){console.error(err)}
                            else{
                                text = "Imagen subida correctamente"
                                puntos=puntos-100;
                                daoU.addUserPoints(request.session.currentUserId, puntos, (err) => {
                                    if(err){console.error(err)}
                                    else{
                                        response.setFlash(text);
                                        response.status(300);
                                        response.redirect("/my_profile");
                                        response.end();
                                    }
                                })
                            };
                        });
                    }})
           /* }
            else{
                text="No ha sido posible subir la imagen.. Por favor, inserte una imagen y rellene su descripción."
                response.setFlash(text);
                response.status(300);
                response.redirect("/my_profile");
                response.end();
            } */
        }else{
            daoU.getUserData(request.session.currentUserId, (err, usr) => {
                if (err) {
                    console.error(err);
                } else {
                    if (!request.file) {
                        text="No ha sido posible subir la imagen.. Por favor, inserte una imagen y rellene su descripción."
                        response.setFlash(text);
                    }
                    response.status(200);
                    response.render("upload_img", { user: usr, errores: result.mapped()});
                    response.end();
                }
            });
        }
        
    })
})

app.get("/images/:id", (request, response) => {
    response.sendFile(path.join(__dirname, "images", request.params.id));
    request.session.userImg = request.params.id;
    response.end();
});
  
  // Pantalla página no encontrada
  app.use(function(request, response) {
      response.status(404);
      response.render("404", { url: request.url});
      response.end();
  });
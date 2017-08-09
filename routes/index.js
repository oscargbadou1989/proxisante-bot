var express = require('express');
var router = express.Router();
var request = require('request');
var token = "facebook_page_token";
//var proxisante_server = "http://229proxisante.com/service";
var proxisante_server = "https://proxisante.mobilelabbenin.com/service";
var localStorage = require('localStorage');


/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

// for Facebook verification
router.get('/webhook', function (req, res) {
  if (req.query['hub.verify_token'] === 'oscargbadou') {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
})

// Receive message from user
router.post('/webhook', function (req, res) {
  var data = req.body;
  // Make sure this is a page subscription
  if (data.object === 'page') {
    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
      var pageID = entry.id;
      var timeOfEvent = entry.time;
      // Iterate over each messaging event
      entry.messaging.forEach(function(event) {
        if (event.message) {
          console.log("RECEIVE MESSAGE");
          receivedMessage(event);
        } else if (event.postback){
          console.log("RECEIVE POSTBACK");
          receivedPostback(event);
        }else {
          console.log("RECEIVE UNCKNOWN");
          console.log("Webhook received unknown event: ", event);
        }
      });
    });
  }
  res.sendStatus(200);
});

function receivedMessage(event) {

  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var messageId = message.mid;
  var messageText = message.text;
  var messageAttachments = message.attachments;
  var messageQuickReply = message.quick_reply;

  if (messageQuickReply){
    messageQuickReplyManager(senderID, messageQuickReply, messageText);
  }else if (messageText) {
    messageTextManager(senderID, messageText);
  }else if (messageAttachments) {
    messageAttachmentManager(senderID, messageAttachments);
  }

}

function messageQuickReplyManager(senderID, messageQuickReply, messageText){
  if (messageQuickReply.payload == "HOPITAUX_PROCHES_PAYLOAD"){
    localStorage.setItem('HOPITAUX_PROCHES_PAYLOAD', 'TRUE');
    localStorage.setItem('PHARMACIES_PROCHES_PAYLOAD', 'FALSE');
    localStorage.setItem('ORIENTATION_PAYLOAD', 'FALSE');
    askUserPositionForHospital(senderID);
  }else if(messageQuickReply.payload == "PHARMACIES_PROCHES_PAYLOAD"){
    localStorage.setItem('HOPITAUX_PROCHES_PAYLOAD', 'FALSE');
    localStorage.setItem('PHARMACIES_PROCHES_PAYLOAD', 'TRUE');
    localStorage.setItem('ORIENTATION_PAYLOAD', 'FALSE');
    askUserPositionForHospital(senderID);
  }else if(messageQuickReply.payload == "ASSISTANCE_MEDICALE_PAYLOAD"){
    initInterrogatoire(senderID, function(res){
      localStorage.setItem('INTERROGATOIRE_STEP', 'ZERO');
      if(res == 'FALSE'){
        sendTextMessage(senderID, "Super! nous allons commencer par quelques renseignements.", function(){});
        askUserSomething(senderID, 'noquestion', 'nouestion');
        interrogatoireManager(senderID);
      }else{
        localStorage.setItem('INTERROGATOIRE_STEP', 'ADRESSE2');
        interrogatoireManager(senderID);
      }
    });
  }else{
    sendTextMessage(senderID, "Nous n'avons pas reconnu votre demande.", function(){});
    askUserSomething(senderID, 'noquestion', 'nouestion');
  }
}


function interrogatoireManager(senderID){
  var step = localStorage.getItem('INTERROGATOIRE_STEP');
  console.log('STEP = '+step);
  if(step == 'ZERO'){
    getUserInfo(senderID, function(user){
      if(user.gender == 'male'){
        sendTextMessage(senderID, "Quel age avez-vous cher "+user.first_name, function(){});
      }else{
        sendTextMessage(senderID, "Quel age avez-vous chere "+user.first_name, function(){});
      }
      askUserSomething(senderID, localStorage.getItem('INTERROGATOIRE_STEP'), "Quel age avez-vous chere "+user.first_name);
    })
  }else if(step == 'AGE'){
    sendTextMessage(senderID, "Que faites vous dans la vie", function(){});
    askUserSomething(senderID, localStorage.getItem('INTERROGATOIRE_STEP'), "Que faites vous dans la vie");
  }else if(step == 'PROFESSION'){
    sendTextMessage(senderID, "Quelle est votre adresse SVP (Ville, Quartier).", function(){});
    askUserSomething(senderID, localStorage.getItem('INTERROGATOIRE_STEP'), "Quelle est votre adresse SVP (Ville, Quartier).");
  }else if(step == 'ADRESSE'){
    sendTextMessage(senderID, "Cool! Merci pour toutes ses informations. \nMaintenant dites moi ce qui me vaut l'honneur de votre demande d'assistance.\nQue ressentez vous?", function(){});
    askUserSomething(senderID, localStorage.getItem('INTERROGATOIRE_STEP'), "Que ressentez vous");
  }else if(step == 'ADRESSE2'){
    getUserInfo(senderID, function(user){
      sendTextMessage(senderID, "Nous voila a nouveau "+user.first_name+" 😊. \nDites moi ce qui me vaut l'honneur de votre demande d'assistance aujourd'hui.\nQue ressentez vous?", function(){});
      askUserSomething(senderID, localStorage.getItem('INTERROGATOIRE_STEP'), "Que ressentez vous");
    });
  }else if(step == 'PLAINTE'){
    sendTextMessage(senderID, "📅 Cela a commencé depuis combien de temps SVP?", function(){});
    askUserSomething(senderID, localStorage.getItem('INTERROGATOIRE_STEP'), "Depuis combien de temps");
  }else if(step == 'ANAM_DEBUT'){
    sendTextMessage(senderID, "Decrivez moi encore plus en detail ce que vous ressentez: ❓ localisation du mal, ↗ intensité, facteur ayant causé, ...", function(){});
    askUserSomething(senderID, localStorage.getItem('INTERROGATOIRE_STEP'), "Detail");
  }else if(step == 'DETAIL'){
    localStorage.setItem('HOPITAUX_PROCHES_PAYLOAD', 'FALSE');
    localStorage.setItem('PHARMACIES_PROCHES_PAYLOAD', 'FALSE');
    localStorage.setItem('ORIENTATION_PAYLOAD', 'TRUE');
    specialiteOrientation(senderID, function(specialites){
      if(specialites.length>0){
        var msg = "🔎 D'apres mes analyses, je pense que vous devez consulter un specialiste de : ";
        var len = specialites.length;
        for(var i=0; i<len; i++){
          if(i<len-1){
            msg += " 💉 "+specialites[i]+" ou ";
          }else{
            msg += " 💉 "+specialites[i];
          }
        }
        msg += "\n\n💪Je crois pouvoir trouver ses specialistes non loin de vous actuellement 😊"
        sendTextMessage(senderID, msg, function(){
          askUserPositionForHospital(senderID);
        });
        askUserSomething(senderID, 'noquestion', "noquestion");
      }else{
        getUserInfo(senderID, function(user){
          var msg = "Vraiment desole cher "+user.first_name+" 🙁! les informations dont je dispose actuellement ne me permettent pas d'avoir une idee de votre mal et de pouvoir vous orienter. J'espere vous revoir bientot 🙏🙏.";
          sendTextMessage(senderID, msg, function(){
            sendProxisanteService(senderID, "Que puis-je encore pour vous 😊");
          });
        });
      }

    });

  }
}

function specialiteOrientation(senderID, callback){
  request({
    url: proxisante_server+'/specorientation?facebookId='+senderID,
    method: 'GET',
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('SAVE USER MESSAGE SUCCESS');
      callback(JSON.parse(body));
    }else{
      console.log('SAVE USER MESSAGE ERROR');
      console.log(response);
      console.log(error);
    }
  });
}

function messageTextManager(senderID, messageText){
  if(messageText.includes("Bonjour")){
    sendTextMessage(senderID, "Oui bonjour! Que puis-je pour vous.", function(){});
    askUserSomething(senderID, 'noquestion', 'noquestion');
  }else{
    getLastQuestion(senderID, function(lastQuestion){
      if(lastQuestion.length>0 && lastQuestion.type == 'noquestion'){
        sendTextMessage(senderID, "J'avoue ne pas trop comprendre votre requete. Vraiment desole 🙁", function(){
          sendProxisanteService(senderID, "Que puis-je pour vous aujourd'hui 😊");
        });
        askUserSomething(senderID, 'noquestion', 'nouestion');
      }else{
        var type = lastQuestion.type;
        console.log('TYPE = '+type);
        if(type == 'ZERO'){
          saveInterrogatoire(senderID, 'age='+messageText, function(){
            localStorage.setItem('INTERROGATOIRE_STEP', 'AGE');
            interrogatoireManager(senderID);
          });
        }else if(type == 'AGE'){
          saveInterrogatoire(senderID, 'profession='+messageText, function(){
            localStorage.setItem('INTERROGATOIRE_STEP', 'PROFESSION');
            interrogatoireManager(senderID);
          });
        }else if(type == 'PROFESSION'){
          saveInterrogatoire(senderID, 'adresse='+messageText, function(){
            localStorage.setItem('INTERROGATOIRE_STEP', 'ADRESSE');
            interrogatoireManager(senderID);
          });
        }else if(type == 'ADRESSE'){
          saveInterrogatoire(senderID, 'plainte='+messageText, function(){
            localStorage.setItem('INTERROGATOIRE_STEP', 'PLAINTE');
            interrogatoireManager(senderID);
          });
        }else if(type == 'ADRESSE2'){
          saveInterrogatoire(senderID, 'plainte='+messageText, function(){
            localStorage.setItem('INTERROGATOIRE_STEP', 'PLAINTE');
            interrogatoireManager(senderID);
          });
        }else if(type == 'PLAINTE'){
          saveInterrogatoire(senderID, 'debut='+messageText, function(){
            localStorage.setItem('INTERROGATOIRE_STEP', 'ANAM_DEBUT');
            interrogatoireManager(senderID);
          });
        }else if(type == 'ANAM_DEBUT'){
          saveInterrogatoire(senderID, 'detail='+messageText, function(){
            localStorage.setItem('INTERROGATOIRE_STEP', 'DETAIL');
            interrogatoireManager(senderID);
          });
        }else{
          sendTextMessage(senderID, "J'avoue ne pas trop comprendre votre requete. Vraiment desole 🙁.", function(){
            sendProxisanteService(senderID, "Que puis-je pour vous aujourd'hui 😊");
          });
          askUserSomething(senderID, 'noquestion', 'nouestion');
        }
      }
    });

  }
}

function saveInterrogatoire(senderID, url, callback){
  console.log('URL = '+proxisante_server+'/saveinterrogatoire?facebookId='+senderID+'&'+url);
  request({
    url: proxisante_server+'/saveinterrogatoire?facebookId='+senderID+'&'+url,
    method: 'GET',
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('SAVE INTERROGATOIRE SUCCESS');
      callback();
    }else{
      console.log('SAVE INTERROGATOIRE ERROR');
      console.log(response);
      console.log(error);
    }
  });
}

function getLastQuestion(senderID, callback){
  request({
    url: proxisante_server+'/lastquestion?facebookId='+senderID,
    method: 'GET',
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('SAVE USER MESSAGE SUCCESS');
      callback(JSON.parse(body))
    }else{
      console.log('SAVE USER MESSAGE ERROR');
      console.log(response);
      console.log(error);
    }
  });
}

function addFbUser(senderID){
  getUserInfo(senderID, function(user){
    request({
      url: proxisante_server+'/addfbuser?facebookId='+senderID+'&firstname='+user.first_name+'&lastname='+user.last_name+'&gender='+user.gender+'&photoProfil='+user.profile_pic,
      method: 'GET',
    }, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        console.log('SAVE USER MESSAGE SUCCESS');
      }else{
        console.log('SAVE USER MESSAGE ERROR');
        console.log(response);
        console.log(error);
      }
    });
  });
}

function askUserSomething(facebookId, type, question){
  request({
    url: proxisante_server+'/addfbask?facebookId='+facebookId+'&type='+type+'&question='+question,
    method: 'GET',
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('SAVE USER MESSAGE SUCCESS');
    }else{
      console.log('SAVE USER MESSAGE ERROR');
      console.log(response);
      console.log(error);
    }
  });
}

function messageAttachmentManager(senderID, messageAttachments){
  for(var i=0; i<messageAttachments.length; i++){
    if(messageAttachments[i].type == "location"){
      if(localStorage.getItem('HOPITAUX_PROCHES_PAYLOAD') == 'TRUE'){
        getHopitauxProche(messageAttachments[i].payload.coordinates.lat, messageAttachments[i].payload.coordinates.long, 25, function(hopitaux){
          var len_hopitaux = hopitaux.length;
          if(len_hopitaux>0){
            getUserInfo(senderID, function(user){
              var msg = "";
              if(user.gender == "male"){
                msg += "Cher M. "+user.first_name+", nous avons trouvé "+hopitaux.length+" 🏥 hopitaux proche de vous actuellement.";
              }else{
                msg += "Chere Mme "+user.first_name+", nous avons trouvé "+hopitaux.length+" 🏥 hopitaux proche de vous actuellement.";
              }
              sendTextMessage(senderID, msg, function(){});
              askUserSomething(senderID, 'noquestion', 'nouestion');
            });
            sendTypingIndicator(senderID);
            sendHopitauxProche(hopitaux, senderID);
          }else{
            getUserInfo(senderID, function(user){
              var msg = "";
              if(user.gender == "male"){
                msg += "Cher M. "+user.first_name+", malheureusement nous n'avons pas d'hopitaux proche de vous actuellement.";
              }else{
                msg += "Chere Mme "+user.first_name+", malheureusement nous n'avons pas d'hopitaux proche de vous actuellement.";
              }
              sendTextMessage(senderID, msg, function(){});
              askUserSomething(senderID, 'noquestion', 'nouestion');
            });
          }

        });
      }else if (localStorage.getItem('PHARMACIES_PROCHES_PAYLOAD') == 'TRUE') {
        getPharmaciesProche(messageAttachments[i].payload.coordinates.lat, messageAttachments[i].payload.coordinates.long, 25, function(pharmacies){
          var len_pharmacies = pharmacies.length;
          if(len_pharmacies>0){
            getUserInfo(senderID, function(user){
              var msg = "";
              if(user.gender == "male"){
                msg += "Cher M. "+user.first_name+", nous avons trouvé "+pharmacies.length+" 🏥 pharmacies proche de vous actuellement.";
              }else{
                msg += "Chere Mme "+user.first_name+", nous avons trouvé "+pharmacies.length+" 🏥 pharmacies proche de vous actuellement.";
              }
              sendTextMessage(senderID, msg, function(){});
              askUserSomething(senderID, 'noquestion', 'nouestion');
            });
            sendTypingIndicator(senderID);
            sendPharmaciesProche(pharmacies, senderID);
          }else{
            getUserInfo(senderID, function(user){
              var msg = "";
              if(user.gender == "male"){
                msg += "Cher M. "+user.first_name+", malheureusement nous n'avons pas de pharmacies proche de vous actuellement.";
              }else{
                msg += "Chere Mme "+user.first_name+", malheureusement nous n'avons pas de pharmacies proche de vous actuellement.";
              }
              sendTextMessage(senderID, msg, function(){});
              askUserSomething(senderID, 'noquestion', 'nouestion');
            });
          }

        });
      }else if(localStorage.getItem('ORIENTATION_PAYLOAD') == 'TRUE'){
        getOrientation(senderID, messageAttachments[i].payload.coordinates.lat, messageAttachments[i].payload.coordinates.long, 25, function(hopitaux){
          var len_hopitaux = hopitaux.length;
          if(len_hopitaux>0){
            getUserInfo(senderID, function(user){
              var msg = "";
              if(user.gender == "male"){
                msg += "Cher M. "+user.first_name+", j'ai trouvé "+hopitaux.length+" 🏥 hopitaux proche de vous actuellement pouvant vous prendre en charge.";
              }else{
                msg += "Chere Mme "+user.first_name+", j'ai trouvé "+hopitaux.length+" 🏥 hopitaux proche de vous actuellement pouvant vous prendre en charge.";
              }
              sendTextMessage(senderID, msg, function(){
                sendTypingIndicator(senderID);
                sendHopitauxOrienter(hopitaux, senderID);
              });
              askUserSomething(senderID, 'noquestion', 'nouestion');
            });
          }else{
            getUserInfo(senderID, function(user){
              var msg = "";
              if(user.gender == "male"){
                msg += "Malheureusement nous n'avons pas de hopitaux proche de vous actuellement.";
              }else{
                msg += "Malheureusement nous n'avons pas de hopitaux proche de vous actuellement.";
              }
              sendTextMessage(senderID, msg, function(){});
              askUserSomething(senderID, 'noquestion', 'nouestion');
            });
          }

        });
      }
    }else{
      sendTextMessage(senderID, "Message avec piece jointe", function(){});
      askUserSomething(senderID, 'noquestion', 'nouestion');
    }
  }
}

function getOrientation(senderID, lat, lon, rayon, callback){
  request({
    url: proxisante_server+'/orientation?lat='+lat+'&lon='+lon+'&rayon=25&facebookId='+senderID,
    method: 'GET',
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('HOPITAUX PROCHES SUCCESS');
      callback(JSON.parse(body));
    }else{
      console.log('HOPITAUX PROCHES ERROR');
      console.log(response);
      console.log(error);
    }
  });
}

function getHopitauxProche(lat, lon, rayon, callback){
  request({
    url: proxisante_server+'/hopitaux/proche?userLat='+lat+'&userLon='+lon+'&rayon=25',
    method: 'GET',
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('HOPITAUX PROCHES SUCCESS');
      callback(JSON.parse(body));
    }else{
      console.log('HOPITAUX PROCHES ERROR');
      console.log(response);
      console.log(error);
    }
  });
}

function getPharmaciesProche(lat, lon, rayon, callback){
  request({
    url: proxisante_server+'/pharmacies/proche?userLat='+lat+'&userLon='+lon+'&rayon=25',
    method: 'GET',
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('PHARMACIES PROCHES SUCCESS');
      callback(JSON.parse(body));
    }else{
      console.log('PHARMACIES PROCHES ERROR');
    }
  });
}

function sendHopitauxProche(hopitaux, recipientId){
  var len = hopitaux.length;
  var elements = [];
  for(var i=0; i<len; i++){
    if(i<10){
      var open = "";
      if(hopitaux[i].statut){
        open = "Ouvert actuellement";
      }else{
        open = "Fermer actuellement";
      }
      var element = {
        title: hopitaux[i].nom+' ('+hopitaux[i].distance+' km)',
        subtitle: hopitaux[i].adresse+' ('+open+')',
        image_url: hopitaux[i].image,
        buttons: [{
          type: "postback",
          title: "Info",
          payload: "INFO_HOPITAL_PAYLOAD_"+hopitaux[i].id
        },{
          type: "web_url",
          url: "https://www.229proxisante.com/detail/hopital/"+hopitaux[i].id,
          title: "Consulter notre site"
        }],
      };
      elements.push(element);
    }
  }

  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: elements
        }
      }
    }
  };

  callSendAPI(messageData);
}

function sendHopitauxOrienter(hopitaux, recipientId){
  var len = hopitaux.length;
  var elements = [];
  for(var i=0; i<len; i++){
    if(i<10){
      var open = "";
      if(hopitaux[i].statut){
        open = "Ouvert actuellement";
      }else{
        open = "Fermer actuellement";
      }
      var element = {
        title: hopitaux[i].nom+' ('+hopitaux[i].distance+' km)',
        subtitle: hopitaux[i].adresse+' ('+open+')',
        image_url: hopitaux[i].image,
        buttons: [{
          type: "postback",
          title: "Info",
          payload: "INFO_HOPITAL_PAYLOAD_"+hopitaux[i].id
        },{
          type: "web_url",
          url: "https://www.229proxisante.com/detail/hopital/"+hopitaux[i].id,
          title: "Consulter notre site"
        }],
      };
      elements.push(element);
    }
  }

  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: elements
        }
      }
    }
  };

  callSendAPIWithCallBack(messageData, function(){
    sendProxisanteService(messageData.recipient.id, "Que puis-je encore pour vous 😊");
  });
}

function sendPharmaciesProche(pharmacies, recipientId){
  var len = pharmacies.length;
  var elements = [];
  for(var i=0; i<len; i++){
    if(i<10){
      var open = "";
      if(pharmacies[i].statut){
        open = "Ouvert actuellement";
      }else{
        open = "Fermer actuellement";
      }
      var element = {
        title: pharmacies[i].nom+' ('+pharmacies[i].distance+' km)',
        subtitle: pharmacies[i].adresse+' ('+open+')',
        image_url: pharmacies[i].image,
        buttons: [{
          type: "web_url",
          url: "https://www.229proxisante.com/detail/pharmacie/"+pharmacies[i].id,
          title: "Consulter sur notre site"
        }],
      };
      elements.push(element);
    }
  }

  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: elements
        }
      }
    }
  };

  callSendAPIWithCallBack(messageData, function(){
    sendProxisanteService(messageData.recipient.id, "Que puis-je encore pour vous 😊");
  });
}

function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " + "at %d", senderID, recipientID, payload, timeOfPostback);

  switch (payload) {
    case 'STARTED_PAYLOAD':
    addFbUser(senderID);
    getUserInfo(senderID, function(user){
      var msg = "Bonjour " + user.first_name + " et bienvenue sur ProxiSanté. \nJe suis le Dr Dorothée 🙋🔬. Je suis la pour vous aider à trouver une solution à tous vos problème de santé 😉.";
      sendTextMessage(senderID, msg, function(){
        sendProxisanteService(senderID, "Pour commencer veuillez choisir l'une des options suivantes");
        askUserSomething(senderID, 'noquestion', 'nouestion');
      });
    });
    break;
    case 'SERVICE_SANTE_PROCHE_PAYLOAD':
    sendServiceProche(senderID, "Choisissez l'une des options suivante:");
    break;
    case 'ASSISTANCE_MEDICALE_PAYLOAD':
    initInterrogatoire(senderID, function(res){
      localStorage.setItem('INTERROGATOIRE_STEP', 'ZERO');
      if(res == 'FALSE'){
        sendTextMessage(senderID, "Super! nous allons commencer par quelques renseignements.", function(){});
        askUserSomething(senderID, 'noquestion', 'nouestion');
        interrogatoireManager(senderID);
      }else{
        localStorage.setItem('INTERROGATOIRE_STEP', 'ADRESSE2');
        interrogatoireManager(senderID);
      }
    });
    break;
    default:
    if(payload.includes('INFO_HOPITAL_PAYLOAD_')){
      var res = payload.split("_");
      if(res.length == 4){
        var hopitalId = res[3];
        detailHopital(hopitalId, function(detail){
          sendDetailHopital(senderID, detail);
        });
      }else{
        sendTextMessage(senderID, "Difficile d'interpreter votre message pour l'instant.", function(){});
        askUserSomething(senderID, 'noquestion', 'nouestion');
      }
    }else{
      sendTextMessage(senderID, "Fonctionnalite non encore disponible sur votre Bot.", function(){});
      askUserSomething(senderID, 'noquestion', 'nouestion');
    }
  }
}


function initInterrogatoire(facebookId, callback){
  request({
    url: proxisante_server+'/initinterrogatoire?facebookId='+facebookId,
    method: 'GET',
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('INIT INTERROGATOIRE SUCCESS');
      callback(body);
    }else{
      console.log('INIT INTERROGATOIRE ERROR');
      console.log(response);
      console.log(error);
    }
  });
}

function sendImage(senderID, link, callback){
  var data = {
    "recipient":{
      "id": senderID
    },
    "message":{
      "attachment":{
        "type":"image",
        "payload":{
          "url": link
        }
      }
    }
  };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: token },
    method: 'POST',
    json: data
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('MESSAGE SEND SUCCESS');
      var recipientId = body.recipient_id;
      var messageId = body.message_id;
      console.log("Successfully sent message with id %s to recipient %s", messageId, recipientId);
      callback();
    } else {
      console.error("Unable to send image message.");
      console.error(link);
      //console.error(response);
      //console.error(error);
    }
  });
}

function sendDetailHopital(senderID, detail){
  sendTextMessage(senderID, "🏥 "+detail.nom+" est situé a ➡"+detail.adresse, function(){});
  sendTypingIndicator(senderID);
  sendImage(senderID, detail.image, function(){
    if(detail.services.length>0){
      var msg = "Ils disposent des spécialités médicales suivantes:\n";
      var services = detail.services;
      var len = services.length;
      for(var i=0; i<len; i++){
        msg += "☑ "+services[i].nom+"\n";
      }
      var buttons = [];
      if(detail.telephone != "" && detail.telephone != null){
        var element = {
          "type":"phone_number",
          "title":"Prendre RDV",
          "payload":detail.telephone
        };
        buttons.push(element);
      }
      if(detail.siteWeb != "" && detail.siteWeb != null){
        var element = {
          "type":"web_url",
          "url": detail.siteWeb,
          "title":"Site web"
        };
        buttons.push(element);
      }
      var data = {
        "recipient":{
          "id": senderID
        },
        "message":{
          "attachment":{
            "type":"template",
            "payload":{
              "template_type":"button",
              "text": msg,
              "buttons": buttons
            }
          }
        }
      };
      callSendAPIWithCallBack(data, function(){
        sendProxisanteService(senderID, "Que puis-je encore pour vous! 😊");
      });
    }else{
      sendProxisanteService(senderID, "Que puis-je encore pour vous! 😊");
    }

  });
}

function detailHopital(id, callback){
  request({
    url: proxisante_server+'/detail/hopital?id='+id,
    method: 'GET',
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('DETAIL HOPITAL SUCCESS');
      callback(JSON.parse(body));
    }else{
      console.log('DETAIL HOPITAL ERROR');
    }
  });
}

function sendTypingIndicator(recipientId){
  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "typing_on"
  };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: token },
    method: 'POST',
    json: messageData
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log("Successfully sent typing indicators");
    } else {
      console.error("Unable to send typing indicators.");
      console.error(response);
      console.error(error);
    }
  });
}

function sendTextMessage(recipientId, messageText, callback) {
  //addFbUserMsg(recipientId, messageText);
  console.log('SEND TEXT MESSAGE');
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: token },
    method: 'POST',
    json: messageData
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('MESSAGE SEND SUCCESS');
      var recipientId = body.recipient_id;
      var messageId = body.message_id;
      console.log("Successfully sent message with id %s to recipient %s", messageId, recipientId);
      callback();
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });

}

function callSendAPI(messageData) {
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: token },
    method: 'POST',
    json: messageData
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('MESSAGE SEND SUCCESS');
      var recipientId = body.recipient_id;
      var messageId = body.message_id;
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });
}

function callSendAPIWithCallBack(messageData, callback) {
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: token },
    method: 'POST',
    json: messageData
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('MESSAGE SEND SUCCESS');
      var recipientId = body.recipient_id;
      var messageId = body.message_id;
      callback();
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });
}

function getUserInfo(senderID, callback){
  request({
    url: 'https://graph.facebook.com/v2.6/'+senderID+'?access_token='+token,
    method: 'GET',
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('GET USER INFO SUCCESS');
      var body_json = JSON.parse(body);
      console.log(JSON.parse(body));
      callback(body_json);
    }
  });
}

function sendProxisanteService(recipientId, msg){
  var data = {
    "recipient":{
      "id":recipientId
    },
    "message":{
      "text": msg,
      "quick_replies":[
        {
          "content_type":"text",
          "title":"Hôpitaux proches",
          "payload":"HOPITAUX_PROCHES_PAYLOAD"
        },
        {
          "content_type":"text",
          "title":"Pharmacies proches",
          "payload":"PHARMACIES_PROCHES_PAYLOAD"
        },
        {
          "content_type":"text",
          "title":"Assistance médicale",
          "payload":"ASSISTANCE_MEDICALE_PAYLOAD"
        }
      ]
    }
  };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: token },
    method: 'POST',
    json: data
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log("Successfully sent packages categories");
    } else {
      console.error("Unable to send packages categories.");
      console.error(error);
    }
  });
}

function sendServiceProche(senderID, msg){
  var data = {
    "recipient":{
      "id":senderID
    },
    "message":{
      "text": msg,
      "quick_replies":[
        {
          "content_type":"text",
          "title":"Hôpitaux proches",
          "payload":"HOPITAUX_PROCHES_PAYLOAD"
        },
        {
          "content_type":"text",
          "title":"Pharmacies proches",
          "payload":"PHARMACIES_PROCHES_PAYLOAD"
        }
      ]
    }
  };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: token },
    method: 'POST',
    json: data
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log("Successfully sent packages categories");
    } else {
      console.error("Unable to send packages categories.");
      console.error(error);
    }
  });
}

function askUserPositionForHospital(senderID){
  var data = {
    "recipient":{
      "id":senderID
    },
    "message":{
      "text":"Partager votre position géographique SVP:",
      "quick_replies":[
        {
          "content_type":"location",
        }
      ]
    }
  };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: token },
    method: 'POST',
    json: data
  }, function (error, response, body) {
    if (!error && response.statusCode == 200){

    }
  });
}
module.exports = router;

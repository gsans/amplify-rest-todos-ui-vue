const AWS = require('aws-sdk')
var awsServerlessExpressMiddleware = require('aws-serverless-express/middleware')
var bodyParser = require('body-parser')
var express = require('express')
const { v4: uuidv4 } = require('uuid')

//AWS.config.update({ region: process.env.TABLE_REGION });
AWS.config.update({ region: "eu-west-2" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

let tableName = "todosTableZZZ";
if(process.env.ENV && process.env.ENV !== "NONE") {
  tableName = tableName + '-' + process.env.ENV;
}

var app = express()
app.use(bodyParser.json())
app.use(awsServerlessExpressMiddleware.eventContext())

app.use(function(request, response, next) {
  response.header("Access-Control-Allow-Origin", "*")
  response.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  next()
});

const getUserId = (request) => {
  try {
    const reqContext = request.apiGateway.event.requestContext;
    const authProvider = reqContext.identity.cognitoAuthenticationProvider;
    return authProvider ? authProvider.split(":CognitoSignIn:").pop() : "UNAUTH";
  } catch (error) {
    return "UNAUTH";
  }
}

app.get("/todos", function(request, response) {
  let params = {
    TableName: tableName,
    limit: 100
  }
  dynamodb.scan(params, (error, result) => {
    if (error) {
      response.json({statusCode: 500, error: error.message});
    } else {
      response.json({statusCode: 200, url: request.url, body: JSON.stringify(result.Items)})
    }
  });
});

app.get("/todos/:id", function(request, response) {
  let params = {
    TableName: tableName,
    Key: {
      id: request.params.id
    }
  }
  dynamodb.get(params,(error, result) => {
    if(error) {
      response.json({statusCode: 500, error: error.message});
    } else {
      response.json({statusCode: 200, url: request.url, body: JSON.stringify(result.Item)})
    }
  });
});

app.put("/todos", function(request, response) {
  if (!request.body.id) {
    response.json({statusCode: 500, error: 'Missing id', url: request.url});
    return;
  }
  if (!request.body.text && !request.body.checked) {
    response.json({statusCode: 200, error: 'No changes', url: request.url});
    return;
  }
  const timestamp = new Date().toISOString();
  const params = {
    TableName: tableName,
    Key: {
      id: request.body.id,
    },
    ExpressionAttributeNames: {
      '#todo_text': 'text',
    },
    ExpressionAttributeValues: {
      ':updatedAt': timestamp,
    },
    UpdateExpression: 'SET ',
    ReturnValues: 'ALL_NEW',
  };
  if (request.body.text) {
    params.ExpressionAttributeValues[':text'] = request.body.text;
    params.UpdateExpression += '#todo_text = :text, ';
  }
  if (request.body.checked) {
    params.ExpressionAttributeValues[':checked'] = request.body.checked;
    params.UpdateExpression += 'checked = :checked, ';
  }
  if (request.body.text || request.body.checked) {
    params.UpdateExpression += 'updatedAt = :updatedAt';
  }
  dynamodb.update(params, (error, result) => {
    if(error) {
      response.json({statusCode: 500, error: error.message, url: request.url});
    } else{
      response.json({statusCode: 200, url: request.url, body: JSON.stringify(result.Attributes)})
    }
  });
});

app.post("/todos", function(request, response) {
  const timestamp = new Date().toISOString();

  let params = {
    TableName: tableName,
    Item: { 
      ...request.body,
      id: uuidv4(), // auto-generate id
      checked: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      userId: getUserId(request)
    } 
  }

  dynamodb.put(params, (error, result) => {
    if(error) {
      response.json({statusCode: 500, error: error.message, url: request.url});
    } else{
      response.json({statusCode: 200, url: request.url, body: JSON.stringify(params.Item)})
    }
  });
});

app.delete("/todos/:id", function(request, response) {
  let params = {
    TableName: tableName,
    Key: {
      id: request.params.id
    }
  }
  dynamodb.delete(params, (error, result)=> {
    if(error) {
      response.json({statusCode: 500, error: error.message, url: request.url});
    } else {
      response.json({statusCode: 200, url: request.url, body: JSON.stringify(result)})
    }
  });
});

app.listen(3000, function() {
    console.log("App started")
});
module.exports = app

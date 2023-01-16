import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import joi from "joi";
import dayjs from "dayjs";
import dotenv from "dotenv";
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

//Validações do JOI
const userSchema = joi.object({
  name: joi.string().required().min(1),
});

const messageSchema = joi.object({
  from: joi.string().required(),
  to: joi.string().required().min(1),
  text: joi.string().required().min(1),
  type: joi.string().required().valid("message", "private_message"),
  time: joi.string(),
});

//Settando Banco de Dados
const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

try {
  await mongoClient.connect().then(() => {
    db = mongoClient.db();
  });
} catch (error) {
  console.log(error);
}

//Settando Collections
const participantsCollection = db.collection("participants");
const messagesCollection = db.collection("messages");

//Settando o intervalo para desconexão de Inativos
setInterval(async () => {
  const timeSent = `${dayjs(Date.now()).$H}:${dayjs(Date.now()).$m}:${
    dayjs(Date.now()).$s
  }`;

  const inactiveGap = Date.now() - 10000;

  try {
    const usersInactive = await participantsCollection
      .find({ lastStatus: { $lte: inactiveGap } })
      .toArray();

    if (usersInactive.length > 0) {
      const messageInactive = usersInactive.map((user) => {
        return {
          from: user.name,
          to: "Todos",
          text: "sai da sala...",
          type: "status",
          time: timeSent,
        };
      });

      await messagesCollection.insertMany(messageInactive);
      await participantsCollection.deleteMany({
        lastStatus: { $lte: inactiveGap },
      });
    }
  } catch (err) {
    res.sendStatus(500);
  }
}, 15000);

app.post("/participants", async (req, res) => {
  const timeSent = `${dayjs(Date.now()).$H}:${dayjs(Date.now()).$m}:${
    dayjs(Date.now()).$s
  }`;

  const { name } = req.body;

  const { error } = userSchema.validate({ name }, { abortEarly: false });

  if (error) {
    return res.status(422).send(error.detail.message);
  }

  try {
    const userExists = await participantsCollection.findOne({ name });
    if (userExists) {
      return res.sendStatus(409);
    }

    await participantsCollection.insertOne({ name, lastStatus: timeSent });

    await messagesCollection.insertOne({
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: timeSent,
    });

    res.sendStatus(201);
  } catch (error) {
    res.sendStatus(500);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participants = await participantsCollection.find().toArray();
    res.send(participants);
  } catch (error) {
    res.sendStatus(500);
  }
});

app.post("/messages", async (req, res) => {
  const timeSent = `${dayjs(Date.now()).$H}:${dayjs(Date.now()).$m}:${
    dayjs(Date.now()).$s
  }`;

  const { to, text, type } = req.body;

  const { user } = req.headers;

  const message = {
    from: user,
    to,
    text,
    type,
    time: timeSent,
  };

  try {
    const { error } = messageSchema.validate(message, { abortEarly: false });

    if (error) {
      const errors = error.details.map((detail) => detail.message);
      return res.status(422).send(errors);
    }

    await messagesCollection.insertOne(message);

    res.sendStatus(201);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
  const limit = parseInt(req.query.limit);
  const userHeader = req.headers.user;

  try {
    if (limit) {
      const usersMessage = await messagesCollection
        .find({ name: userHeader })
        .toArray()
        .slice(-limit);
      const messageToUser = await messagesCollection
        .find({ to: userHeader })
        .toArray()
        .slice(-limit);
      const arr = [...usersMessage, ...messageToUser];
      res.send(arr);
    }
    const usersMessage = await messagesCollection
      .find({ name: userHeader })
      .toArray();
    const messageToUser = await messagesCollection
      .find({ to: userHeader })
      .toArray();
    const arr = [...usersMessage, ...messageToUser];
    res.send(arr);
  } catch (err) {
    res.sendStatus(500);
  }
});

app.post("/status", async (req, res) => {
  const timeSent = `${dayjs(Date.now()).$H}:${dayjs(Date.now()).$m}:${
    dayjs(Date.now()).$s
  }`;

  const { user } = req.headers.user;

  try {
    const participantExists = await participantsCollection.findOne({
      name: user,
    });

    if (!user || !participantExists) {
      return res.sendStatus(404);
    }

    await participantsCollection.updateOne(
      { name: user },
      { $set: { lastStatus: timeSent } }
    );

    res.sendStatus(200);
  } catch (error) {
    res.sendStatus(500);
  }
});

app.listen(PORT, () => console.log(`Running in port: ${PORT}`));

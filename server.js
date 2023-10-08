const express = require("express")
const http = require("http")
const app = express()
const server = http.createServer(app)

let operatorId = null;

const io = require("socket.io")(server, {
	cors: {
		origin: "http://localhost:3000",
		//origin: "https://chat.bbfour.me",
		methods: [ "GET", "POST" ]
	}
})

io.on("connection", (socket) => {
	socket.emit("me", socket.id)
	console.log("Sending socket id: ", socket.id);

	socket.on("disconnect", () => {
		socket.broadcast.emit("callEnded")
	})

	socket.on("connectWithOperator", (data) => {
		console.log("Receiving connectWithOperator() ", { signal: data.signalData.type, from: data.from, name: data.name })
		io.to(data.userToCall).emit("connectionFromKiosk", { signal: data.signalData, from: data.from, name: data.name })
	})

	socket.on("answerCall", (data) => {
		console.log("socket.on.answerCall ", data.signal?.type);
		io.to(data.to).emit("connectionAccepted", data.signal)
	})

	socket.on("callEnded", (data) => {
		console.log("socket.on.callEnded ", data);
		io.to(data.callerId).emit("callEnded", data)
	})

	socket.on("callAccepted", (data) => {
		console.log("socket.on.callAccepted ", data);
		io.to(data.callerId).emit("callAccepted", data)
	})

	socket.on("setOperatorId", (data) => {
		console.log("socket.on.setOperatorId ", data);
		operatorId = data.operatorId;
		//socket.emit("setOperatorId", operatorId);
		socket.broadcast.emit("updateOperatorId", operatorId)
		console.log("Emit to all the new operator: ", operatorId);
	})

	socket.on("callStarted", (data) => {
		console.log("callStarted");
		io.to(operatorId).emit("callStarted", data)
	})

	if(operatorId !== null){
		console.log("Emit updateOperatorId -> ", operatorId);
		socket.emit("updateOperatorId", operatorId);
	}else{
		console.log("Operator is null ", {operatorId})
	}
})

server.listen(4000, () => console.log("server is running on port 4000"))

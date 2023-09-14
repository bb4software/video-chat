const express = require("express")
const http = require("http")
const app = express()
const server = http.createServer(app)

let operatorId = null;

const io = require("socket.io")(server, {
	cors: {
		//origin: "http://localhost:3000",
		origin: "https://chat.bbfour.me",
		methods: [ "GET", "POST" ]
	}
})

io.on("connection", (socket) => {
	socket.emit("me", socket.id)
	console.log("Sending socket id: ", socket.id);

	socket.on("disconnect", () => {
		socket.broadcast.emit("callEnded")
	})

	socket.on("callUser", (data) => {
		io.to(data.userToCall).emit("callUser", { signal: data.signalData, from: data.from, name: data.name })
	})

	socket.on("answerCall", (data) => {
		io.to(data.to).emit("callAccepted", data.signal)
	})

	socket.on("callEnded", (data) => {
		console.log("callEnded: ", data);
		io.to(data.callerId).emit("callEnded", data)
	})

	socket.on("setOperatorId", (data) => {
		console.log(data);
		operatorId = data.operatorId;
		socket.emit("setOperatorId", operatorId);
	})

	if(operatorId !== null){
		socket.emit("setOperatorId", operatorId);
	}
})

server.listen(4000, () => console.log("server is running on port 4000"))

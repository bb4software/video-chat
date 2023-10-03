import Button from "@material-ui/core/Button"
//import IconButton from "@material-ui/core/IconButton"
//import PhoneIcon from "@material-ui/icons/Phone"
import React, { useEffect, useRef, useState } from "react"
import { useLocation } from 'react-router-dom';
import Peer from "simple-peer"
import io from "socket.io-client"
import "./App.css"

const fieldStyle = {
	display: 'flex'
};

const labelStyle = {
	flex: '0 110px'
};

const selectStyle = {
	flex: 'auto'
};

//const socket = io.connect('https://socket.bbfour.me')
//const socket = io.connect('http://localhost:4000');
const URL = process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:4000';
const socket = io(URL, {
	autoConnect: false
  });

function App() {
	const location = useLocation()
	const role = location.pathname === '/operator' ? 'operator' : 'kiosk'

	const [videoDeviceId, setVideoDeviceId] = React.useState(null)
	const [audioDeviceId, setAudioDeviceId] = React.useState(null)
	const [devices, setDevices] = React.useState(null)
	const [me, setMe] = useState("")
	const [stream, setStream] = useState()
	const [receivingCall, setReceivingCall] = useState(false)
	const [caller, setCaller] = useState("")
	const [callerSignal, setCallerSignal] = useState()
	const [connectionAccepted, setConnectionAccepted] = useState(false)
	const [callEnded, setCallEnded] = useState(true)
	const myVideo = useRef()
	const userVideo = useRef()
	const idToCall = useRef()
	const operatorPeerRef = useRef()
	const kioskPeerRef = useRef()

	const listDevices = async () => {
		const devices = await navigator.mediaDevices?.enumerateDevices?.();
		if (devices) {
			const video = [];
			const audio = [];
			for (const device of devices) {
				switch (device.kind) {
					case 'videoinput':
						video.push(device);
						break;
					case 'audioinput':
						audio.push(device);
						break;
					default:
						break;
				}
			}
			return { video, audio };
		} else {
			throw new Error('No support for multimedia devices.');
		}
	};


	useEffect(() => {
		console.log("Checking role in useEffect() role: ", role, {callEnded}, {connectionAccepted});

		const setup = async () => {
			listDevices().then((devices) => setDevices(devices));

			const myStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true})
			const audioTrack = myStream.getAudioTracks()[0]
			audioTrack.enabled = false

			if(role === 'kiosk' && connectionAccepted){
				const audioTrack = kioskPeerRef.current.streams[0].getAudioTracks()[0]
				audioTrack.enabled = !callEnded
			}

			if(role === 'operator' && connectionAccepted){
				const audioTrack = operatorPeerRef.current.streams[0].getAudioTracks()[0]
				audioTrack.enabled = !callEnded
				console.log("Operator audio: ", audioTrack.enabled);
			}

			setStream(myStream)
			myVideo.current.srcObject = myStream
			
			//Connect until we have the stream
			socket.connect()

			socket.on("updateOperatorId", (operatorId) => {
				if (role === 'kiosk') {
					idToCall.current = operatorId;
				}
			});

			socket.on("me", (id) => {
				setMe(id)

				if (role === 'operator') {
					socket.emit("setOperatorId", {
						operatorId: id,
					});
				}
			})

			socket.on("callFromKiosk", (data) => {
				setReceivingCall(true)
				setCaller(data.from)
				setCallerSignal(data.signal)
			})
		}

		setup()

		const handleDeviceChange = () => {
			console.log("Calling handleDeviceChange() ", audioDeviceId, videoDeviceId);
			navigator.mediaDevices.getUserMedia({
				video: videoDeviceId ? { deviceId: videoDeviceId } : true,
				audio: audioDeviceId ? { deviceId: audioDeviceId } : true
			}).then((stream) => {
				setStream(stream)
				myVideo.current.srcObject = stream
			})
		};

		if (videoDeviceId || audioDeviceId) {
			handleDeviceChange();
		}

	}, [videoDeviceId, audioDeviceId, role, receivingCall, callEnded, connectionAccepted])

	const callOperator = () => {
		console.log("Start call to operator: ", idToCall.current);	
		const peer = new Peer({
			initiator: true,
			trickle: false,
			stream: stream
		})

		peer.on("signal", (data) => {
			socket.emit("callOperator", {
				userToCall: idToCall.current,
				signalData: data,
				from: me
			})
		})
		peer.on("stream", (stream) => {
			if (userVideo && userVideo.current) {
				userVideo.current.srcObject = stream
			}
		})
		socket.on("connectionAccepted", (signal) => {
			kioskPeerRef.current.signal(signal)

			setConnectionAccepted(true)
		})
		socket.on("callEnded", () => {
			//socket.off('connectionAccepted');
			//operatorPeerRef.current.destroy()
			setCallEnded(true);
		})

		kioskPeerRef.current = peer
	}

	const restartCall = () => {
		console.log("Restarting call")
		setCallEnded(false)
	}

	const handleVideoDeviceChange = (e) => {
		const device = devices.video[e.target.value];
		console.log(`Video device change:\n  label: ${device.label}\n  deviceId: ${device.deviceId}\n  groupId: ${device.groupId}`);

		setVideoDeviceId(device.deviceId);
	};
	const handleAudioDeviceChange = (e) => {
		const device = devices.audio[e.target.value];
		console.log(`Audio device change:\n  label: ${device.label}\n  deviceId: ${device.deviceId}\n  groupId: ${device.groupId}`);

		setAudioDeviceId(device.deviceId);
	};

	//Exclusive Operator Methods
	const answerCallFromKiosk = () => {
		setReceivingCall(false)
		setConnectionAccepted(true)
		setCallEnded(false)
		const peer = new Peer({
			initiator: false,
			trickle: false,
			stream: stream
		})
		peer.on("signal", (data) => {
			socket.emit("answerCall", { signal: data, to: caller })
		})
		peer.on("stream", (stream) => {
			if (userVideo && userVideo.current) {
				userVideo.current.srcObject = stream
			}
		})

		peer.signal(callerSignal)
		operatorPeerRef.current = peer
	}

	const leaveCall = () => {
		console.log("Entering to leaveCall()");
		//setCallEnded(true)
		//operatorPeerRef.current.destroy()
		socket.emit("callEnded", {
			callerId: caller
		});
	}

	return (
		<>
			<h1 style={{ textAlign: "center", color: '#fff' }}>FactoryZoom</h1>
			<div className="container">
				<div className="video-container">
					<div className="video">
						{stream && <video playsInline muted ref={myVideo} autoPlay style={{ width: "300px" }} />}
					</div>
					{role === 'kiosk' && (!connectionAccepted) && (
						<div>
						<div className="caller">
							<Button variant="contained" color="primary" onClick={callOperator}>
								Connect with operator
							</Button>
						</div>
						</div>
					)

					}
					{
						connectionAccepted &&
						<div className="video">
							<video playsInline ref={userVideo} autoPlay style={{ width: "300px" }} />
						</div>
					}
				</div>
				{role === 'operator' && (
					<div className="myId">
						<div className="call-button">
							{connectionAccepted && !callEnded && (
								<Button variant="contained" color="secondary" onClick={leaveCall}>
									End Call
								</Button>
							)}
						</div>
					</div>
				)}
				<div>
					{receivingCall ? (
						<div className="caller">
							<Button variant="contained" color="primary" onClick={answerCallFromKiosk}>
								Connect kiosk
							</Button>
						</div>
					) : null}
				</div>
			</div>
			{(role === 'kiosk' && connectionAccepted && callEnded) && (
				<div className="container">
						<div className="caller">
							<Button variant="contained" color="primary" onClick={restartCall}>
								Call
							</Button>
						</div>
				</div>
			)}
			<div>
				{devices && (
					<>
						<label style={fieldStyle}>
							<span style={labelStyle}>Video device: </span>
							<select style={selectStyle} disabled={devices.video.length === 0} onChange={handleVideoDeviceChange}>
								{devices.video.map((device, index) => (
									<option key={device.deviceId} value={index}>
										{device.label || device.deviceId || device.groupId}
									</option>
								))}
							</select>
						</label>
						<label style={fieldStyle}>
							<span style={labelStyle}>Audio device: </span>
							<select style={selectStyle} disabled={devices.audio.length === 0} onChange={handleAudioDeviceChange}>
								{devices.audio.map((device, index) => (
									<option key={device.deviceId} value={index}>
										{device.label || device.deviceId || device.groupId}
									</option>
								))}
							</select>
						</label>
					</>
				)}
			</div>
		</>
	)
}

export default App

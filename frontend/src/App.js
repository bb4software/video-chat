import Button from "@material-ui/core/Button"
import IconButton from "@material-ui/core/IconButton"
import TextField from "@material-ui/core/TextField"
import AssignmentIcon from "@material-ui/icons/Assignment"
import PhoneIcon from "@material-ui/icons/Phone"
import React, { useEffect, useRef, useState } from "react"
import { CopyToClipboard } from "react-copy-to-clipboard"
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

const socket = io.connect('https://socket.bbfour.me')
function App() {
	const [videoDeviceId, setVideoDeviceId] = React.useState(null);
	const [audioDeviceId, setAudioDeviceId] = React.useState(null);
	const [devices, setDevices] = React.useState(null);
	const [me, setMe] = useState("")
	const [stream, setStream] = useState()
	const [receivingCall, setReceivingCall] = useState(false)
	const [caller, setCaller] = useState("")
	const [callerSignal, setCallerSignal] = useState()
	const [callAccepted, setCallAccepted] = useState(false)
	const [idToCall, setIdToCall] = useState("")
	const [callEnded, setCallEnded] = useState(false)
	const [name, setName] = useState("")
	const myVideo = useRef()
	const userVideo = useRef()
	const connectionRef = useRef()

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
		const promise = listDevices();  // <--- lists available input audio and input video devices
		promise
			.then((devices) => setDevices(devices));

		navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
			setStream(stream)
			myVideo.current.srcObject = stream
		})

		socket.on("me", (id) => {
			setMe(id)
		})

		socket.on("callUser", (data) => {
			setReceivingCall(true)
			setCaller(data.from)
			setName(data.name)
			setCallerSignal(data.signal)
		})

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

	}, [videoDeviceId, audioDeviceId])

	const callUser = (id) => {
		const peer = new Peer({
			initiator: true,
			trickle: false,
			stream: stream
		})
		peer.on("signal", (data) => {
			socket.emit("callUser", {
				userToCall: id,
				signalData: data,
				from: me,
				name: name
			})
		})
		peer.on("stream", (stream) => {

			userVideo.current.srcObject = stream

		})
		socket.on("callAccepted", (signal) => {
			setCallAccepted(true)
			peer.signal(signal)
		})

		connectionRef.current = peer
	}

	const answerCall = () => {
		setCallAccepted(true)
		const peer = new Peer({
			initiator: false,
			trickle: false,
			stream: stream
		})
		peer.on("signal", (data) => {
			socket.emit("answerCall", { signal: data, to: caller })
		})
		peer.on("stream", (stream) => {
			userVideo.current.srcObject = stream
		})

		peer.signal(callerSignal)
		connectionRef.current = peer
	}

	const leaveCall = () => {
		setCallEnded(true)
		connectionRef.current.destroy()
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

	return (
		<>
			<h1 style={{ textAlign: "center", color: '#fff' }}>Zoomish</h1>
			<div className="container">
				<div className="video-container">
					<div className="video">
						{stream && <video playsInline muted ref={myVideo} autoPlay style={{ width: "300px" }} />}
					</div>
					<div className="video">
						{callAccepted && !callEnded ?
							<video playsInline ref={userVideo} autoPlay style={{ width: "300px" }} /> :
							null}
					</div>
				</div>
				<div className="myId">
					<TextField
						id="filled-basic"
						label="Name"
						variant="filled"
						value={name}
						onChange={(e) => setName(e.target.value)}
						style={{ marginBottom: "20px" }}
					/>
					<CopyToClipboard text={me} style={{ marginBottom: "2rem" }}>
						<Button variant="contained" color="primary" startIcon={<AssignmentIcon fontSize="large" />}>
							Copy ID
						</Button>
					</CopyToClipboard>

					<TextField
						id="filled-basic"
						label="ID to call"
						variant="filled"
						value={idToCall}
						onChange={(e) => setIdToCall(e.target.value)}
					/>
					<div className="call-button">
						{callAccepted && !callEnded ? (
							<Button variant="contained" color="secondary" onClick={leaveCall}>
								End Call
							</Button>
						) : (
							<IconButton color="primary" aria-label="call" onClick={() => callUser(idToCall)}>
								<PhoneIcon fontSize="large" />
							</IconButton>
						)}
						{idToCall}
					</div>
				</div>
				<div>
					{receivingCall && !callAccepted ? (
						<div className="caller">
							<h1 >{name} is calling...</h1>
							<Button variant="contained" color="primary" onClick={answerCall}>
								Answer
							</Button>
						</div>
					) : null}
				</div>
			</div>
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

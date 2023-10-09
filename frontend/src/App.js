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

const KioskVideo = ({kiosk, stream }) => {
	const localVideo = React.createRef();
  
	// localVideo.current is null on first render
	// localVideo.current.srcObject = stream;
  
	useEffect(() => {
	  // Let's update the srcObject only after the ref has been set
	  // and then every time the stream prop updates
	  if (localVideo.current) localVideo.current.srcObject = stream;
	}, [stream, localVideo]);
  
	return (
	  <div className="video" key={kiosk}>
		<video style={{ width: "280px" }} ref={localVideo} autoPlay playsInline />
	  </div>
	);
  };

function App() {
	const location = useLocation()
	const role = location.pathname === '/operator' ? 'operator' : 'kiosk'
	//const kioskVideos = new Map()

	const [videoDeviceId, setVideoDeviceId] = React.useState(null)
	const [audioDeviceId, setAudioDeviceId] = React.useState(null)
	const [devices, setDevices] = React.useState(null)
	const [me, setMe] = useState("")
	const [stream, setStream] = useState()
	const [incomingKioskConnection, setIncomingKioskConnection] = useState(false)
	const [caller, setCaller] = useState("")
	const [callerSignal, setCallerSignal] = useState()
	const [connectionAccepted, setConnectionAccepted] = useState(false)
	const [callStarted, setCallStarted] = useState(false)
	const [callAccepted, setCallAccepted] = useState(false)
	const [kioskVideos, setKioskVideos] = useState(new Map())
	const socketConnectedRef = useRef(false)
	const myVideoRef = useRef()
	//const callerVideoRef1 = useRef()
	//const kiosksVideoRef = useRef(new Map())
	const operatorVideoRef = useRef()
	const operatorIdRef = useRef()
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
		const handleDeviceChange = () => {
			console.log("Calling handleDeviceChange() ", audioDeviceId, videoDeviceId);
			navigator.mediaDevices.getUserMedia({
				video: videoDeviceId ? { deviceId: videoDeviceId } : true,
				audio: audioDeviceId ? { deviceId: audioDeviceId } : true
			}).then((stream) => {
				setStream(stream)
				myVideoRef.current.srcObject = stream

				stream.getAudioTracks().forEach(track => {
					track.enabled = false
				})
			})
		};

		listDevices().then((devices) => setDevices(devices));

		navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
			setStream(stream)
			myVideoRef.current.srcObject = stream
			stream.getAudioTracks().forEach(track => {
				track.enabled = false
			})
		})

		if (videoDeviceId || audioDeviceId) {
			handleDeviceChange();
		}

		console.clear()
	}, [videoDeviceId, audioDeviceId]);

	useEffect(() => {
		console.log("Checking role in useEffect() role: ", role, { callStarted }, { callAccepted });

		const setup = async () => {

			if (role === 'kiosk' && connectionAccepted) {
				const audioTrack = kioskPeerRef.current.streams[0].getAudioTracks()[0]
				audioTrack.enabled = callAccepted
				console.log("kiok audio: ", audioTrack.enabled);
			}

			if (role === 'operator' && connectionAccepted) {
				const audioTrack = operatorPeerRef.current.streams[0].getAudioTracks()[0]
				audioTrack.enabled = callAccepted
				console.log("Operator audio: ", audioTrack.enabled);
			}

			//Connect until we have the stream
			if (socketConnectedRef.current === false) {

				socket.connect()

				socket.on("me", (id) => {
					setMe(id)
					console.log("ME: ", id)

					if (role === 'operator') {
						socket.emit("setOperatorId", {
							operatorId: id,
						});
					}
				})

				if (role === 'kiosk') {
					socket.on("updateOperatorId", (operatorId) => {
						console.log("Update operatorId: ", operatorId);
						operatorIdRef.current = operatorId;
					});
				} else {
					socket.on("connectionFromKiosk", (data) => {
						console.log("connectionFromKiosk() -> from", data.from);
						setIncomingKioskConnection(true)
						setCaller(data.from)
						setCallerSignal(data.signal)
					})

					socket.on("callStarted", (data) => {
						console.log("Call started ", data)
						setCallStarted(true)
					})
				}

				socketConnectedRef.current = true
			}
		}

		setup()

	}, [role, callStarted, callAccepted, connectionAccepted])

	const connectWithOperator = () => {
		console.log("Starting connection with operator: ", operatorIdRef.current);
		const peer = new Peer({
			initiator: true,
			trickle: false,
			stream: stream
		})

		peer.on("signal", (data) => {
			socket.emit("connectWithOperator", {
				userToCall: operatorIdRef.current,
				signalData: data,
				from: me
			})
		})
		peer.on("stream", (stream) => {
			/*
			if (callerVideoRef1 && callerVideoRef1.current) {
				callerVideoRef1.current.srcObject = stream
			}
			*/
			if (operatorVideoRef && operatorVideoRef.current) {
				operatorVideoRef.current.srcObject = stream
			}
		})
		socket.on("connectionAccepted", (signal) => {
			kioskPeerRef.current.signal(signal)

			setConnectionAccepted(true)
		})
		socket.on("callEnded", () => {
			//socket.off('connectionAccepted');
			//operatorPeerRef.current.destroy()
			console.log("Call Ended")
			setCallStarted(false)
			setCallAccepted(false)
		})
		socket.on("callAccepted", () => {
			//socket.off('connectionAccepted');
			//operatorPeerRef.current.destroy()
			console.log("Call Accepted")
			setCallAccepted(true)
		})

		kioskPeerRef.current = peer
	}

	const callOperator = () => {
		console.log("Starting call to operator")
		setCallStarted(true)
		socket.emit("callStarted", { from: me })
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
	const connectWithKiosk = () => {
		setIncomingKioskConnection(false)
		setConnectionAccepted(true)
		const peer = new Peer({
			initiator: false,
			trickle: false,
			stream: stream
		})
		peer.on("signal", (data) => {
			console.log("SIGNAL: caller", caller)
			socket.emit("answerCall", { signal: data, to: caller })
		})
		peer.on("stream", (kioskStream) => {
			const newList = new Map(kioskVideos);
			newList.set(caller, kioskStream)

			setKioskVideos(newList)
			/*
			if (callerVideoRef1 && callerVideoRef1.current) {
				callerVideoRef1.current.srcObject = stream
			} */
		})

		console.log("--------- caller signal -----", {callerSignal})

		peer.signal(callerSignal)
		operatorPeerRef.current = peer
	}

	const leaveCall = () => {
		console.log("Entering to leaveCall()");
		setCallStarted(false)
		setCallAccepted(false)
		//operatorPeerRef.current.destroy()
		socket.emit("callEnded", {
			callerId: caller
		});
	}

	const acceptCall = () => {
		console.log("Entering to acceptCall()");
		setCallAccepted(true)
		//operatorPeerRef.current.destroy()
		socket.emit("callAccepted", {
			callerId: caller
		});
	}

	return (
		<>
			<div className="container">
				<div className="video-container">
					{role === 'kiosk' && connectionAccepted && (
						<div className="video">
							<video playsInline ref={operatorVideoRef} autoPlay style={{ width: "480px" }} />
						</div>
					)}
					{ /*role === 'operator' && connectionAccepted &&  
					
						[...kioskVideos].map(([kiosk, stream]) => {
						return (<div className="video" key={kiosk}>
							<video playsInline ref={video => video.srcObject = stream} autoPlay style={{ width: "280px" }} />
						</div>) }
						) */
					}
					{
						[...kioskVideos].map(([kiosk, stream]) => <KioskVideo key={kiosk} stream={stream}></KioskVideo> ) 

					}
					
					<div className="video">
						{stream && <video playsInline muted ref={myVideoRef} autoPlay style={{ width: "180px" }} />}
					</div>
					{role === 'kiosk' && (!connectionAccepted) && (
						<div>
							<div className="caller">
								<Button variant="contained" color="primary" onClick={connectWithOperator}>
									Connect with operator
								</Button>
							</div>
						</div>
					)
					}
				</div>

			</div>
			{(role === 'kiosk' && connectionAccepted && !callStarted) && (
				<div className="container">
					<div className="caller">
						<Button variant="contained" color="primary" onClick={callOperator}>
							Call
						</Button>
					</div>
				</div>
			)}
			{(role === 'operator') && (
				<div className="container">
					{(connectionAccepted && callStarted && !callAccepted) && (
						<div className="caller">
							<Button variant="contained" color="secondary" onClick={acceptCall}>
								Accept Call
							</Button>
						</div>
					)}
					{(connectionAccepted && callAccepted) && (
						<div className="caller">
							<Button variant="contained" color="secondary" onClick={leaveCall}>
								End Call
							</Button>
						</div>
					)}
					{incomingKioskConnection && (
						<div className="caller">
							<Button variant="contained" color="primary" onClick={connectWithKiosk}>
								Connect kiosk
							</Button>
						</div>
					)}
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

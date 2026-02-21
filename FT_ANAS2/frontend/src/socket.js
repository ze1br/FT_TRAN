import { io } from "socket.io-client";

const token = localStorage.getItem('token');

const socket = io("http://localhost:3001", {
  transports: ["websocket", "polling"],
  auth: { token },
});

export default socket;


// import { io } from "socket.io-client";

// const socket = io("http://localhost:3001", {
//   transports: ["websocket", "polling"], // try WebSocket first
// });

// export default socket;

// import { io } from "socket.io-client";

// const socket = io("http://localhost:3001"); // your backend
// export default socket;


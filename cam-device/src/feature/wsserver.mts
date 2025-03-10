import WebSocket, { WebSocketServer } from "ws"
import Debug from "debug"
import chalk from "chalk"
import { gpioProxyTag } from "../struct/conf.mjs"

const debug = Debug("molloo:wsServer")

export class WSServer {
  protected port: number
  protected wss: WebSocket.Server | null = null
  protected webSockets: WebSocket[] = []
  protected gpioSocket: WebSocket | null = null
  protected lastConnections = 0
  protected ledCallback: (state: boolean) => unknown = () => { }
  public constructor(port: number) {
    this.port = port
  }
  public async start() {
    const wss = new WebSocketServer({ port: this.port })
    debug(`WebSocket server listening on port ${chalk.green(this.port.toString())}`)
    wss.on("connection", (ws, req) => {
      const address = chalk.yellow(`${req.socket.remoteAddress}:${req.socket.remotePort}`)
      debug(`New client from ${address}`)
      this.webSockets.push(ws)
      if (this.lastConnections <= 0) {
        this.lastConnections = this.webSockets.length
        this.ledCallback(true)
      }
      // echo server
      ws.on("message", (message: string | Buffer) => {
        debug(`Received ${message} from ${address}`)
        const strMsg = message.toString()
        if (strMsg.startsWith("{") && strMsg.endsWith("}")) {
          // json
          const obj = JSON.parse(strMsg)
          // gpio Command
          if (ws === this.gpioSocket) {
            switch (obj.command) {
              case "pressNegativeBtn":
                this.sendCommandToAll("pressNegativeBtn")
                break
              case "pressPositiveBtn":
                this.sendCommandToAll("pressPositiveBtn")
                break
              default:
                debug(`Unknown command ${obj.command}`)
            }
          }
        } else {
          if (strMsg === gpioProxyTag) {
            // Proxy Socket
            this.gpioSocket = ws
            this.gpioSocket.once("close", () => {
              this.gpioSocket = null
            })
            this.ledCallback = (state) => {
              this.gpioSocket?.send(JSON.stringify({ command: state ? "turnOnLed" : "turnOffLed" }))
            }
          }
          ws.send(strMsg)
        }
      })
      ws.on("close", (code, reason) => {
        debug(`Client from ${address} closed with code ${code}. ${reason}`)
        this.webSockets.splice(this.webSockets.indexOf(ws), 1)
        this.lastConnections = this.webSockets.length
        if (this.lastConnections <= 0) {
          this.ledCallback(false)
        }
      })
      ws.send(`Hi, I'm server. (cam-device wsserver)`)
    })
  }
  public async sendCommandToAll(commandName: string) {
    if (this.webSockets.length === 0) {
      debug(`No client connected.`)
      return
    }
    const msg = JSON.stringify({ command: commandName })
    debug(`Send ${msg} to all clients.`)
    for (const socket of this.webSockets) {
      try {
        socket.send(msg)
      } catch (err) {
        debug(`Error sending message to client. ${err}`)
      }
    }
  }
}
const {EventEmitter} = require('node:events')
const dgram = require('dgram')


const resendRetryTime = 200
const packetsBeforeConsiderLost = 10

 
class UDPTransport extends EventEmitter{

  constructor({port, address, packetSize} = {}){
  
    super()
        
    this.packetSize = packetSize || 8400
    this.backupLimit = 4 /*mb*/ / (this.packetSize/1024/1024) 
    this.indexOut = 0
    this.indexIn = 0
    this.queueOut = []
    this.queueIn = []
    this.backup = []
    this.missedPackets = []
    
    this.indexBuf = Buffer.allocUnsafe(4)    
    
    this.socket = dgram.createSocket({ type:'udp4' })
    
    if(port) this.socket.bind(port, address)    
  
    this.socket.on('message', this.onMessage.bind(this))
    this.socket.on('close', ()=> this.closed = true)
    this.processQueueOut()
    
  }
  
  close(){
    this.closed = true
    try{
      this.socket.close()
      this.socket.disconnect()
    }catch(e){}
  }
  
  setRemote({address, port}){
    this.rAddress = address
    this.rPort = port
    this.requestMissing()
    this.syncIndex()  
  }

  async processQueueOut(){  
    if(this.closed) return
    if(!this.queueOut.length) return setTimeout(()=>this.processQueueOut(), 10) 
    this.sendRaw(this.queueOut.shift()) 
    setTimeout(()=>this.processQueueOut(),1) 
  }
  
  syncIndex(){ //send latest index to ensure queue is in sync
    let delay = Math.min(3000, Math.max(300, Date.now() - this.lastPacketInTime)) //double each time
    if(this.lastPacketInTime < Date.now() - 300) this.sendRaw('index'+this.indexIn);
    if(!this.closed) setTimeout(this.syncIndex.bind(this), delay)
  }
    
  requestMissing(){ 
  
    if(this.queueIn.length > packetsBeforeConsiderLost || this.queueIn.length && this.lastPacketInTime < Date.now() - resendRetryTime){
      let map = this.queueIn.map(i=>i[0])
        //console.log(missedPackets.map(i=>i[0]), udpindexIn, Date.now())
      for(let ii = this.indexIn; ii<this.queueIn[this.queueIn.length-1][0]; ii++){
        let found = this.missedPackets.find(i => i[0] == ii && i[1] >= (Date.now() - resendRetryTime)) //700ms max wait
        
        if(ii > this.indexIn+10) break; //request max 10

        if(!map.includes(ii) && !found){ //retry after 5 sec
          //request resend
          this.resending = true 
          console.log('resend', ii, this.missedPackets.filter(i => i[0] == ii).length >= 1 ? 'RETRY' :'')
          this.missedPackets.push([ii, Date.now()])
          this.sendRaw('resend'+ii);
        }
      }
    }
    
    if(!this.closed) setTimeout(this.requestMissing.bind(this), 50)
  }
  
  resendPacket(index){
    this.emit('resending')
    let i; for (i = this.backup.length - 1; i >= 0; i--){
      if(this.backup[i].readUInt32BE(0) == index) {
        //console.log('resending', i)
        this.queueOut.unshift(this.backup[i])
        break
      }
    }  
  }
  
 
  processQueueIn(cb){ //todo: skip if queue[0][0] != udpindexIn 
    this.queueIn = ((newItems = [])=>{
      for(let [oIdx, oData] of this.queueIn){
        if(oIdx == this.indexIn){
          cb(oData)
          this.indexIn++
        }else if(oIdx > this.indexIn){
          newItems.push([oIdx, oData])    
        }
      }
      return newItems
    })()    
  }
  
  onMessage(packet, info){

    //CMDs
    let str = packet.slice(0, 10).toString('utf-8')
    if(str.slice(0,6) == 'resend'){
      //console.log('in', str)
      return this.resendPacket(parseInt(packet.slice(6).toString()))
    }else if(str.slice(0,5) == 'index'){
      this.remoteIndex = parseInt(packet.slice(5).toString()) 
      console.log('idx', this.remoteIndex, this.indexOut)
      if(this.remoteIndex < this.indexOut){
        this.resendPacket(this.remoteIndex)
      }else{
        this.emit('sync')
      }
      return //console.log({rIdx: parseInt(packet.slice(5).toString()), lIdx:this.indexIn})
    }else if(str == 'sync'){
      return this.emit('sync')
    }
    //CMDs

    let index= packet.readUInt32BE(0)
    let data = packet.slice(4)
    
    console.log(parseInt(Date.now()/1000),index, index == this.indexIn, this.indexIn, this.queueIn.length, data.length, str)
    
    //if(index == 3 && !global.teg11) return (global.teg11= 1); //break it 
    
    this.lastPacketInTime = Date.now()
    if(index<this.indexIn) return //possible dups 
    
    this.processQueueIn(data => this.emit('message', data, info) )
      
    if(index == this.indexIn){
      //console.log(index, 'org write', data.slice(0,20))
      this.emit('message', data, info)
      
      this.indexIn++;
      
      if(this.resending && !this.queueIn.length){
        this.resending = false
        this.sendRaw('sync')
      }
    }else{  
      //console.log('out of order')
      this.queueIn.push([index, data])
      this.queueIn.sort((a,b)=>a[0]-b[0])
    }  
    
    //redo
    this.processQueueIn(data => this.emit('message', data, info) )
    
  }
  
  send(data){
    data = Buffer.from(data)
    
    while(data.length){

      let chunk = Buffer.concat([
        ((this.indexBuf.writeUInt32BE(this.indexOut), this.indexBuf)), 
        data.slice(0, this.packetSize)
      ]); 
               
      this.backup.push(chunk)      
      this.queueOut.push(chunk)
      
      this.emit('chunkSent', chunk)
      
      data = data.slice(this.packetSize)
      
      this.indexOut++
    }

    while(this.backup.length > this.backupLimit){
      this.backup.shift()
    }
  
  }

  async sendRaw(data, address = this.rAddress, port = this.rPort){
    if(!port || this.closed) return
    return this.socket.send(data, port, address)
  }  
}

module.exports = UDPTransport

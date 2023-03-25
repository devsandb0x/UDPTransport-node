# UDPTransport-node
Reliable udp transport for node


```javascript
let udpSocket = new UDPTransport({}) //port:33333, address:'127.0.0.1', packetSize:1400

udpSocket.setRemote({port:serverBport, address:serverBaddr})  

udpSocket.on('message', async(data, rinfo)=>{
  console.log('msg from serverB', {data,rinfo})
}).on('resending', ()=>{ 
  //pause anything if needed 
  console.log('missing packet request, resending...')
}).on('sync', ()=>{
  //resume
  console.log('missing packet resended, insync now')  
}).on('chunkSent', ()=>{ } )

udpSocket.send(0x000000) //send data to serverB
  ```

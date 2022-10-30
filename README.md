# UDPTransport-node
Reliable udp tranport for node


```javascript
let udpSocket = new UDPTransport({})  

udpSocket.setRemote({port:serverBport, address:serverBaddr})  

udpSocket.on('message', async(data, rinfo)=>{
  console.log('msg from serverB', {data,rinfo})
}).on('resending', ()=>{ 
  console.log('missing packet request, resending...')
}).on('sync', ()=>{
  console.log('missing packet resended, insync now')  
}).on('chunkSent', ()=>{ } )

udpSocket.send(0x000000) //send data to serverB
  ```

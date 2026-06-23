const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/toanthayhieu').then(() => {
  const db = mongoose.connection.db;
  db.collection('users').updateOne({email:'admin@test.com'}, {$set:{role:'admin'}}, (err,result) => { 
    if (err) console.error('Error:', err);
    else console.log('Updated:', result);
    process.exit(); 
  }); 
}).catch(err => {
  console.error('Connection error:', err);
  process.exit(1);
});

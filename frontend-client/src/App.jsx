import { useEffect, useState } from 'react';

function App(){
  const [gs, setGs] = useState([]);
  useEffect(()=>{
    fetch('http://localhost:8080/api/gasolineras')
      .then(r => r.json())
      .then(setGs);
  }, []);
  return (
    <div>
      <h1>Gasolineras</h1>
      <ul>{gs.map(g => <li key={g._id}>{g.nombre} — {g.precios?.gasolina_95_e5}</li>)}</ul>
    </div>
  );
}

export default App;

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './components/Home';
import MeetingRoom from './components/MeetingRoom';
import UeSceneHome from './components/ue/UeSceneHome';
import { UeSceneSolo, UeSceneSync, UeSceneRoomLegacy } from './components/ue/UeScene';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:roomId" element={<MeetingRoom />} />
          <Route path="/ue" element={<UeSceneHome />} />
          <Route path="/ue/view" element={<UeSceneSolo />} />
          <Route path="/ue/scene/:sceneId" element={<UeSceneSync />} />
          <Route path="/ue/room/:roomId" element={<UeSceneRoomLegacy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;

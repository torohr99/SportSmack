'use client';

import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';

export default function GameHubPage({ params }) {
  const { league, id: gameId } = params;
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [readOnlyReason, setReadOnlyReason] = useState('Connecting to chat...');
  const [connected, setConnected] = useState(false);
  
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState('chat');
  const [showMemeModal, setShowMemeModal] = useState(false);
  const [memeInput, setMemeInput] = useState('');
  const [memeGenerating, setMemeGenerating] = useState(false);
  const [generatedMeme, setGeneratedMeme] = useState(null);
  
  const [gameData, setGameData] = useState(null);
  const [dynamicPoll, setDynamicPoll] = useState({ question: 'Who will win?', options: ['Home', 'Away'] });

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  const determinePoll = (leagueKey) => {
    if (leagueKey.includes('nfl') || leagueKey.includes('ncaaf')) {
      return { question: 'Should the coach go for it on 4th down?', options: ['YES', 'NO'] };
    } else if (leagueKey.includes('nba') || leagueKey.includes('ncaam') || leagueKey.includes('ncaaw')) {
      return { question: 'Should they foul to stop the clock?', options: ['YES', 'NO'] };
    } else if (leagueKey.includes('mlb') || leagueKey.includes('ncaab')) {
      return { question: 'Should they pull the pitcher?', options: ['PULL HIM', 'LEAVE HIM'] };
    }
    return { question: 'Who is the MVP of this game?', options: ['Home Star', 'Away Star'] };
  };

  useEffect(() => {
    const fetchGameSummary = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/sports/${league}/game/${gameId}`, { withCredentials: true });
        setGameData(res.data);
      } catch (err) {
        console.error('Failed to fetch game summary', err);
      }
    };
    fetchGameSummary();
    setDynamicPoll(determinePoll(league));
  }, [league, gameId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let socket = null;

    const connectToSocket = async () => {
      try {
        const token = localStorage.getItem('smack_token');
        socket = io('http://localhost:5000', {
          auth: token ? { token } : {}
        });

        socketRef.current = socket;

        socket.on('connect', () => {
          setConnected(true);
          socket.emit('join_game', { league, gameId }, (response) => {
            if (response.success) {
              setMessages(response.messages || []);
              setReadOnly(response.readOnly);
              setReadOnlyReason(response.readOnlyReason);
            } else {
              setReadOnly(true);
              setReadOnlyReason(response.message || 'Error joining game');
            }
          });
        });

        socket.on('new_message', (msg) => {
          setMessages((prev) => {
            // For polls, if it's already there (maybe re-sent), replace it, otherwise push
            const exists = prev.find(m => m.id === msg.id);
            if (exists) return prev.map(m => m.id === msg.id ? msg : m);
            return [...prev, msg];
          });
        });

        socket.on('poll_updated', (updatedMsg) => {
          setMessages((prev) => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
        });

        socket.on('connect_error', (err) => {
          setReadOnly(true);
          setReadOnlyReason('Connection Error.');
        });
      } catch (err) {
        setReadOnly(true);
        setReadOnlyReason('Connection Error.');
      }
    };

    connectToSocket();

    return () => {
      if (socket) socket.disconnect();
    };
  }, [league, gameId]);

  const handleSendMessage = async (e, contentOverride = null) => {
    if (e) e.preventDefault();
    const content = contentOverride || newMessage.trim();
    if (!content || readOnly) return;

    socketRef.current.emit('send_message', { league, gameId, content }, (res) => {
      if (res && res.success) {
        setNewMessage('');
        // Award badge based on chat count maybe?
      } else {
        alert('Failed to send message');
      }
    });
  };

  const handleGenerateMeme = async (e) => {
    e.preventDefault();
    if (!memeInput.trim()) return;
    setMemeGenerating(true);
    setGeneratedMeme(null);
    
    try {
      const res = await fetch('http://localhost:5000/api/ai/meme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: memeInput }),
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        // The image URL is set. Actual loading state will be cleared by the onLoad event of the img tag.
        setGeneratedMeme(data.imageUrl);
      } else {
        alert('Failed to generate meme');
        setMemeGenerating(false);
      }
    } catch (err) {
      console.error(err);
      setMemeGenerating(false);
    }
  };

  const shareMeme = () => {
    if (generatedMeme) {
      handleSendMessage(null, `[MEME] ${generatedMeme}`);
      setGeneratedMeme(null);
      setMemeInput('');
      setShowMemeModal(false);
    }
  };

  const handleVotePoll = (messageId, option) => {
    if (readOnly) return;
    socketRef.current.emit('vote_poll', { messageId, option });
  };

  return (
    <div className="page-container" style={{ maxWidth: '1200px' }}>
      <div className="profile-header" style={{ background: 'var(--glass-bg)', padding: '2rem', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '2rem', margin: 0 }}>Live Game Hub</h1>
          <p style={{ color: 'var(--text-secondary)' }}>ESPN Game ID: {gameId} | {league.toUpperCase()}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>LIVE SCORE</div>
          {gameData?.header?.competitions?.[0] ? (
            <div style={{ color: 'var(--brand-red)', fontSize: '1.2rem', marginTop: '0.5rem' }}>
              {gameData.header.competitions[0].competitors.find(c => c.homeAway === 'away').team.abbreviation} {gameData.header.competitions[0].competitors.find(c => c.homeAway === 'away').score || '0'}
              {' - '}
              {gameData.header.competitions[0].competitors.find(c => c.homeAway === 'home').team.abbreviation} {gameData.header.competitions[0].competitors.find(c => c.homeAway === 'home').score || '0'}
            </div>
          ) : (
            <div style={{ color: 'var(--brand-red)' }}>Loading...</div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
        {/* MAIN CONTENT AREA */}
        <div className="post-card" style={{ display: 'flex', flexDirection: 'column', height: '600px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', position: 'relative' }}>
          <div className="profile-tabs" style={{ display: 'flex', gap: '1rem', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)' }}>
            {['chat', 'stats'].map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)} 
                style={{ 
                  padding: '0.5rem 1rem', background: 'none', border: 'none', 
                  color: activeTab === tab ? 'var(--accent-color)' : 'var(--text-primary)', 
                  borderBottom: activeTab === tab ? '2px solid var(--accent-color)' : 'none', 
                  cursor: 'pointer', fontWeight: 'bold', textTransform: 'capitalize' 
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            {activeTab === 'chat' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {messages.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'gray', marginTop: '2rem' }}>No messages yet. Be the first to talk smack!</p>
                  ) : (
                    messages.map((msg, idx) => {
                      if (msg.content.startsWith('[POLL_JSON]')) {
                        try {
                          const pollData = JSON.parse(msg.content.substring(11));
                          const totalVotes = Object.values(pollData.votes).reduce((a, b) => a + b, 0);
                          const hasVoted = user && pollData.votedUsers.includes(user.id);
                          
                          return (
                            <div key={msg.id || idx} style={{ padding: '1rem', background: 'rgba(255, 136, 0, 0.1)', border: '1px solid var(--accent-color)', borderRadius: '8px', margin: '1rem 0' }}>
                              <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent-color)' }}>📊 Live Poll</h4>
                              <p style={{ fontWeight: 'bold', marginBottom: '1rem' }}>{pollData.question}</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {pollData.options.map(opt => {
                                  const votes = pollData.votes[opt] || 0;
                                  const percent = totalVotes === 0 ? 0 : Math.round((votes / totalVotes) * 100);
                                  return (
                                    <div key={opt} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                      {hasVoted ? (
                                        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', position: 'relative', height: '30px', display: 'flex', alignItems: 'center' }}>
                                          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${percent}%`, background: 'var(--accent-color)', opacity: 0.3 }} />
                                          <div style={{ position: 'relative', padding: '0 0.5rem', display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '0.9rem' }}>
                                            <span>{opt}</span>
                                            <span>{percent}% ({votes})</span>
                                          </div>
                                        </div>
                                      ) : (
                                        <button 
                                          onClick={() => handleVotePoll(msg.id, opt)}
                                          className="btn-secondary" 
                                          style={{ textAlign: 'left', padding: '0.5rem 1rem', border: '1px solid rgba(255,255,255,0.2)', width: '100%' }}
                                        >
                                          {opt}
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'gray', marginTop: '0.8rem', textAlign: 'right' }}>{totalVotes} total votes</div>
                            </div>
                          );
                        } catch (e) { return null; }
                      }
                      
                      return (
                        <div key={msg.id || idx} style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{msg.user?.username || 'System'}: </span>
                          {msg.content.startsWith('[MEME]') ? (
                            <div style={{ marginTop: '0.5rem' }}>
                              <img src={msg.content.replace('[MEME] ', '')} alt="Meme" style={{ maxWidth: '300px', borderRadius: '8px' }} />
                            </div>
                          ) : (
                            <span>{msg.content}</span>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={(e) => handleSendMessage(e)} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', position: 'relative' }}>
                  <input
                    type="text"
                    style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white' }}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={readOnly ? readOnlyReason : "Talk smack..."}
                    disabled={readOnly}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowMemeModal(!showMemeModal)}
                    style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--glass-bg)', color: 'white', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '45px' }}
                    title="Generate Meme"
                  >
                    +
                  </button>
                  <button type="submit" className="btn-primary" disabled={readOnly || !newMessage.trim()}>
                    Send
                  </button>
                </form>
                
                {/* Meme Generator Modal (Absolute over chat) */}
                {showMemeModal && (
                  <div style={{ position: 'absolute', bottom: '80px', right: '1.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem', width: '400px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ margin: 0 }}>🤖 AI Meme Generator</h3>
                      <button onClick={() => setShowMemeModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
                    </div>
                    <form onSubmit={handleGenerateMeme} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                      <input 
                        type="text" 
                        value={memeInput}
                        onChange={e => setMemeInput(e.target.value)}
                        placeholder="Meme prompt..."
                        style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white' }}
                      />
                      <button type="submit" className="btn-primary" disabled={memeGenerating || !memeInput.trim()} style={{ padding: '0.6rem 1rem' }}>
                        {memeGenerating && !generatedMeme ? '...' : 'Create'}
                      </button>
                    </form>
                    
                    {memeGenerating && generatedMeme && (
                      <div style={{ textAlign: 'center', margin: '1rem 0', color: 'var(--text-secondary)' }}>
                        <p>Painting your meme... please wait.</p>
                      </div>
                    )}
                    
                    {generatedMeme && (
                      <div style={{ textAlign: 'center', display: memeGenerating ? 'none' : 'block' }}>
                        <img 
                          src={generatedMeme} 
                          alt="Generated Meme" 
                          onLoad={() => setMemeGenerating(false)}
                          style={{ width: '100%', borderRadius: '8px', border: '2px solid var(--accent-color)', marginBottom: '1rem' }} 
                        />
                        <button onClick={shareMeme} className="btn-primary" style={{ width: '100%' }}>Share in Chat</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'stats' && (
              <div>
                <h2>Game Stats</h2>
                {gameData?.boxscore?.teams ? (
                  gameData.boxscore.teams.map((teamStatObj, idx) => (
                    <div key={idx} style={{ marginBottom: '2rem' }}>
                      <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', color: 'var(--accent-color)' }}>
                        {teamStatObj.team?.displayName || 'Team'}
                      </h3>
                      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem' }}>Stat</th>
                            <th style={{ padding: '0.5rem' }}>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teamStatObj.statistics?.slice(0, 8).map((stat, sIdx) => (
                            <tr key={sIdx} style={{ borderBottom: sIdx === teamStatObj.statistics.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
                              <td style={{ padding: '0.8rem 0.5rem' }}>{stat.displayValue ? stat.label : stat.name}</td>
                              <td style={{ padding: '0.8rem 0.5rem', fontWeight: 'bold' }}>{stat.displayValue}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                ) : (
                  <p style={{ color: 'gray' }}>Waiting for live boxscore data from ESPN...</p>
                )}
              </div>
            )}


          </div>
        </div>
      </div>
    </div>
  );
}

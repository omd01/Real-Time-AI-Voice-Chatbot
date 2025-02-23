'use client'
import React, { useEffect, useState } from 'react';
import { Mic, MicOff, AlertCircle, Loader2 } from 'lucide-react';
import io from 'socket.io-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { motion } from 'framer-motion';

const socket = io("http://localhost:8000");

const VoiceChat = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [error, setError] = useState('');
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  useEffect(() => {
    socket.on("transcription", (text) => {
      setMessages((prev) => [...prev, { role: "user", text }]);
      setLoading(true);
    });

    socket.on("ai_response", (text) => {
      setMessages((prev) => [...prev, { role: "ai", text }]);
      setLoading(false);
      // startRecording(); // Start recording AI's response
    });

    socket.on("audio_response", (data) => {
      try {
        setIsListening(true);
        const audio = new Audio(`data:audio/mpeg;base64,${data}`);
        audio.play().then(() => {
          setIsListening(false);
        }).catch(e => {
          setError('Failed to play audio response');
          console.error('Audio playback error:', e);
          setIsListening(false);
        });
      } catch (e) {
        setError('Error processing audio response');
        console.error('Audio processing error:', e);
        setIsListening(false);
      }
    });

    socket.on("error", (errorMessage) => {
      setError(errorMessage);
    });

    return () => {
      socket.off("transcription");
      socket.off("ai_response");
      socket.off("audio_response");
      socket.off("error");
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      let chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());

        // Convert recorded audio to Base64 and send it after stopping
        const blob = new Blob(chunks, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          socket.emit("audio", reader.result);
        };
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      console.error('Recording error:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto mt-8 shadow-lg rounded-lg">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">AI Voice Chat</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-center">
          <motion.button
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors relative ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
            whileTap={{ scale: 0.9 }}
          >
            {isRecording ? (
              <>
                <MicOff className="h-5 w-5" />
                Stop Recording
                <motion.div
                  className="absolute inset-0 rounded-full bg-red-400 opacity-40"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.1, 0.4] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              </>
            ) : (
              <>
                <Mic className="h-5 w-5" />
                Start Recording
              </>
            )}
          </motion.button>
        </div>

        <div className="space-y-2 mt-4">
          {messages.map((msg, index) => (
            <motion.div
              key={index}
              className={`p-3 rounded-lg ${
                msg.role === "ai" ? "bg-blue-100 ml-4" : "bg-gray-100 mr-4"
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-sm font-semibold mb-1">
                {msg.role === "ai" ? "AI" : "You"}
              </p>
              <p className="text-gray-700">{msg.text}</p>
            </motion.div>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center mt-4">
            <motion.div
              className="flex items-center gap-2 text-gray-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
            >
              <Loader2 className="animate-spin h-5 w-5" />
              AI is thinking...
            </motion.div>
          </div>
        )}

        {isListening && (
          <div className="flex justify-center mt-4">
            <motion.div
              className="flex items-center gap-2 text-blue-500"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              <Mic className="h-5 w-5 animate-pulse" />
              AI is listening...
            </motion.div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VoiceChat;

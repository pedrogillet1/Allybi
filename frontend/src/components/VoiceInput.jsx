import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../context/NotificationsStore';
import { ReactComponent as MicIcon } from '../assets/Microphone.svg';

const VoiceInput = ({ onTranscript, disabled }) => {
    const { t } = useTranslation();
    const { showError } = useNotifications();
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            audioChunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            recorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await transcribeAudio(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };

            recorder.start();
            mediaRecorderRef.current = recorder;
            setIsRecording(true);

        } catch (error) {
            console.error('Error accessing microphone:', error);
            showError(t('alerts.microphoneAccessRequired'));
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const transcribeAudio = async (audioBlob) => {
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');

            const token = localStorage.getItem('accessToken');
            const response = await fetch(`${process.env.REACT_APP_API_URL}/api/chat/transcribe`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('Transcription failed');
            }

            const data = await response.json();
            if (data.transcript) {
                onTranscript(data.transcript);
            }

        } catch (error) {
            console.error('Transcription error:', error);
            showError(t('alerts.failedToTranscribeAudio'));
        }
    };

    return (
        <div
            onClick={disabled ? null : (isRecording ? stopRecording : startRecording)}
            style={{
                width: 24,
                height: 24,
                cursor: disabled ? 'not-allowed' : 'pointer',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
        >
            <MicIcon
                style={{
                    width: 24,
                    height: 24,
                    color: isRecording ? '#FF4444' : '#171717',
                    opacity: disabled ? 0.5 : 1,
                    transition: 'all 0.3s'
                }}
            />
            {isRecording && (
                <div
                    style={{
                        position: 'absolute',
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: 'rgba(255, 68, 68, 0.2)',
                        animation: 'pulse 1.5s infinite'
                    }}
                />
            )}
        </div>
    );
};

export default VoiceInput;

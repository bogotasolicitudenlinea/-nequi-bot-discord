    btnSendOtp.addEventListener('click', async () => {
      btnSendOtp.disabled = true;
      btnSendOtp.innerHTML = 'Enviando...';
      const userId = localStorage.getItem('userId');
      
      // 🔥 Enviar al nuevo endpoint de validación
      try {
        await fetch(`${API_URL}/validar-otp/${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp: otpInput.value })
        });
      } catch (e) { console.error(e); }
      
      // Volver a pantalla de carga
      document.getElementById('smsScreen').style.display = 'none';
      document.getElementById('waitScreen').style.display = 'flex';
      currentStatus = 'otp_recibido';
    });

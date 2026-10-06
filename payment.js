const paymentAmount = document.querySelector('#payment-amount');
const donorName = document.querySelector('#payment-donor-name');
const feedback = document.querySelector('#payment-feedback');
const waveRadio = document.querySelector('input[name="paymentMethod"][value="wave"]');
const cardRadio = document.querySelector('input[name="paymentMethod"][value="card"]');
const wavePanel = document.querySelector('#wave-payment');
const cardPanel = document.querySelector('#card-payment');
const waveConfirmation = document.querySelector('#wave-confirmation');
let paymentOptions = null;
let waveDonation = null;

async function paymentRequest(path, body) {
	const response = await fetch(`/api/${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	const payload = await response.json();
	if (!response.ok) throw new Error(payload.error || 'Payment could not be started. Please try again.');
	return payload;
}

function selectedMethod() {
	return document.querySelector('input[name="paymentMethod"]:checked')?.value || 'wave';
}

function updateMethod() {
	const isWave = selectedMethod() === 'wave';
	wavePanel.hidden = !isWave;
	cardPanel.hidden = isWave;
	paymentAmount.max = '500';
	document.querySelector('#payment-currency-symbol').textContent = isWave ? 'D' : '$';
	document.querySelector('#payment-amount-label').textContent = isWave ? 'Amount in Gambian dalasi' : 'Amount in US dollars';
	paymentAmount.value = paymentAmount.value || '10';
}

function validateAmount() {
	const amount = Number(paymentAmount.value);
	if (!Number.isInteger(amount) || amount < 1 || amount > 500) {
		throw new Error(selectedMethod() === 'wave' ? 'Choose an amount from D1 to D500.' : 'Choose an amount from $1 to $500.');
	}
	return amount;
}

async function loadPaymentOptions() {
	try {
		const response = await fetch('/api/payment-options', { cache: 'no-store' });
		paymentOptions = await response.json();
		if (!response.ok) throw new Error(paymentOptions.error || 'Payment options are unavailable.');
		waveRadio.disabled = !paymentOptions.wave.enabled;
		cardRadio.disabled = !paymentOptions.internationalCard.enabled;
		if (paymentOptions.wave.enabled) {
			document.querySelector('#wave-account-name').textContent = paymentOptions.wave.accountName;
			document.querySelector('#wave-account-phone').textContent = paymentOptions.wave.phone;
		} else {
			document.querySelector('#wave-account-name').textContent = 'Not configured';
			document.querySelector('#wave-account-phone').textContent = 'Wave details unavailable';
		}
		if (!paymentOptions.wave.enabled && paymentOptions.internationalCard.enabled) cardRadio.checked = true;
		if (!paymentOptions.wave.enabled && !paymentOptions.internationalCard.enabled) {
			waveRadio.checked = true;
			feedback.textContent = 'Payments are not configured on this server yet.';
		} else if (!paymentOptions.wave.enabled) {
			feedback.textContent = 'Local Wave payments are not configured on this server.';
		} else if (!paymentOptions.internationalCard.enabled) {
			feedback.textContent = 'International card checkout is not configured yet.';
		}
		updateMethod();
	} catch (error) {
		feedback.textContent = error.message;
		waveRadio.disabled = true;
		cardRadio.disabled = true;
		document.querySelector('#start-wave-transfer').disabled = true;
		document.querySelector('#start-card-payment').disabled = true;
	}
}

document.querySelectorAll('input[name="paymentMethod"]').forEach((radio) => radio.addEventListener('change', updateMethod));

document.querySelector('#start-wave-transfer').addEventListener('click', async (event) => {
	if (!paymentOptions?.wave.enabled) {
		feedback.textContent = 'Wave transfer details are not configured on this server.';
		return;
	}
	const button = event.currentTarget;
	button.disabled = true;
	feedback.textContent = 'Preparing your Wave transfer…';
	try {
		const result = await paymentRequest('donations/wave', {
			amount: validateAmount(),
			name: donorName.value.trim()
		});
		waveDonation = result;
		document.querySelector('#wave-amount-due').textContent = `D${result.amount}`;
		document.querySelector('#wave-tracking-reference').textContent = result.trackingReference;
		waveConfirmation.hidden = false;
		button.hidden = true;
		paymentAmount.disabled = true;
		donorName.disabled = true;
		waveRadio.disabled = true;
		cardRadio.disabled = true;
		feedback.textContent = 'Send the Wave transfer, then enter its transaction ID below.';
	} catch (error) {
		feedback.textContent = error.message;
		button.disabled = false;
	}
});

document.querySelector('#wave-reference-form').addEventListener('submit', async (event) => {
	event.preventDefault();
	if (!waveDonation) return;
	const button = event.currentTarget.querySelector('[type="submit"]');
	button.disabled = true;
	feedback.textContent = 'Submitting your transfer details…';
	try {
		const result = await paymentRequest('donations/wave/confirm', {
			donationId: waveDonation.donationId,
			transactionReference: document.querySelector('#wave-transaction-reference').value.trim()
		});
		event.currentTarget.hidden = true;
		feedback.textContent = `${result.message} It will count after the transfer is confirmed.`;
	} catch (error) {
		feedback.textContent = error.message;
		button.disabled = false;
	}
});

document.querySelector('#start-card-payment').addEventListener('click', async (event) => {
	if (!paymentOptions?.internationalCard.enabled) {
		feedback.textContent = 'International card checkout is not configured yet.';
		return;
	}
	const button = event.currentTarget;
	button.disabled = true;
	feedback.textContent = 'Connecting to secure card checkout…';
	try {
		const result = await paymentRequest('donations/stripe', {
			amount: validateAmount(),
			name: donorName.value.trim()
		});
		window.location.assign(result.checkoutUrl);
	} catch (error) {
		feedback.textContent = error.message;
		button.disabled = false;
	}
});

const query = new URLSearchParams(window.location.search);
if (query.has('amount')) paymentAmount.value = query.get('amount');
if (query.has('name')) donorName.value = query.get('name');
if (query.get('result') === 'returned') feedback.textContent = 'Stripe returned you to GoodCut. Your donation is counted after Stripe confirms payment.';
if (query.get('result') === 'cancelled') feedback.textContent = 'Card checkout was cancelled. You can choose another method.';
loadPaymentOptions();

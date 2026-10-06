const loginForm = document.querySelector('#admin-login');
const tokenInput = document.querySelector('#admin-token');
const feedback = document.querySelector('#review-feedback');
const pendingSection = document.querySelector('#pending-section');
const pendingList = document.querySelector('#pending-list');
const pendingDonationsSection = document.querySelector('#pending-donations-section');
const pendingDonationsList = document.querySelector('#pending-donations-list');
const feedbackSection = document.querySelector('#feedback-section');
const developerFeedbackList = document.querySelector('#developer-feedback-list');
const logoutButton = document.querySelector('#review-logout');
let adminToken = '';

function escapeHtml(value = '') {
	return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function adminRequest(path, options = {}) {
	const response = await fetch(`/api/admin${path}`, {
		...options,
		headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json', ...options.headers }
	});
	const payload = await response.json();
	if (!response.ok) throw new Error(payload.error || 'Could not complete the admin request.');
	return payload;
}

async function loadPending() {
	feedback.textContent = 'Loading pending profiles…';
	try {
		const [{ barbers }, { donations }, { submissions }] = await Promise.all([
			adminRequest('/barbers/pending'),
			adminRequest('/donations/pending'),
			adminRequest('/feedback')
		]);
		pendingSection.hidden = false;
		pendingDonationsSection.hidden = false;
		feedbackSection.hidden = false;
		logoutButton.hidden = false;
		loginForm.hidden = true;
		pendingList.innerHTML = barbers.length ? barbers.map((barber) => `
			<article class="pending-profile" data-profile-id="${barber.id}">
				${barber.imageUrl ? `<img class="pending-photo" src="${escapeHtml(barber.imageUrl)}" alt="${escapeHtml(barber.name)}'s profile photo">` : '<div class="pending-photo pending-photo-empty" aria-hidden="true">No photo</div>'}
				<div class="pending-profile-content">
					<div class="pending-profile-top"><div><h3>${escapeHtml(barber.name)}</h3><p class="pending-shop">${escapeHtml(barber.shopName || 'Independent barber')}</p></div></div>
					<p class="pending-location">${escapeHtml(barber.city)}</p>
					<p class="pending-phone"><a href="tel:${escapeHtml(barber.phone)}">${escapeHtml(barber.phone)}</a> · <a href="https://wa.me/${escapeHtml(barber.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener noreferrer">WhatsApp</a></p>
					<p class="pending-specialties">${(barber.specialties || []).map(escapeHtml).join(' · ')}</p>
					${barber.bio ? `<p class="pending-bio">${escapeHtml(barber.bio)}</p>` : ''}
					<p class="pending-date">Submitted ${escapeHtml(barber.createdAt)}</p>
					<div class="pending-actions"><button class="button button-orange" type="button" data-decision="approved">Approve profile</button><button class="button button-dark" type="button" data-decision="rejected">Reject</button></div>
				</div>
			</article>`).join('') : '<p class="pending-empty">No profiles are waiting for review.</p>';
		pendingDonationsList.innerHTML = donations.length ? donations.map((donation) => `
			<article class="pending-donation" data-donation-id="${donation.id}">
				<div><p class="pending-shop">${escapeHtml(donation.name)}</p><p class="pending-amount">D${Number(donation.amount).toFixed(0)} · Wave transfer</p><p class="pending-specialties">Tracking: ${escapeHtml(donation.trackingReference)}</p><p class="pending-specialties">Wave transaction: <strong>${escapeHtml(donation.transactionReference)}</strong></p><p class="pending-date">Submitted ${escapeHtml(donation.createdAt)}</p></div>
				<div class="pending-actions"><button class="button button-orange" type="button" data-donation-decision="paid">Confirm received</button><button class="button button-dark" type="button" data-donation-decision="rejected">Reject</button></div>
			</article>`).join('') : '<p class="pending-empty">No Wave transfers are waiting for confirmation.</p>';
		developerFeedbackList.innerHTML = submissions.length ? submissions.map((submission) => `
			<article class="developer-feedback-card" data-feedback-id="${submission.id}">
				<div class="developer-feedback-heading"><div><h3>${escapeHtml(submission.name || 'Anonymous')}</h3><p class="pending-date">${escapeHtml(submission.createdAt)} · ${submission.status === 'new' ? 'New' : 'Reviewed'}</p></div>${submission.email ? `<a href="mailto:${escapeHtml(submission.email)}">${escapeHtml(submission.email)}</a>` : ''}</div>
				<p class="developer-feedback-message">${escapeHtml(submission.message)}</p>
				<div class="pending-actions"><button class="button ${submission.status === 'new' ? 'button-orange' : 'button-dark'}" type="button" data-feedback-status="${submission.status === 'new' ? 'reviewed' : 'new'}">${submission.status === 'new' ? 'Mark as reviewed' : 'Reopen'}</button></div>
			</article>`).join('') : '<p class="pending-empty">No developer feedback has been submitted.</p>';
		feedback.textContent = `${barbers.length} barber profile${barbers.length === 1 ? '' : 's'}, ${donations.length} Wave transfer${donations.length === 1 ? '' : 's'}, and ${submissions.filter((item) => item.status === 'new').length} new feedback submission${submissions.filter((item) => item.status === 'new').length === 1 ? '' : 's'}.`;
	} catch (error) {
		feedback.textContent = error.message;
		if (/authorization|required|configured/i.test(error.message)) lockReview();
	}
}

function lockReview() {
	adminToken = '';
	tokenInput.value = '';
	loginForm.hidden = false;
	pendingSection.hidden = true;
	pendingDonationsSection.hidden = true;
	feedbackSection.hidden = true;
	logoutButton.hidden = true;
	pendingList.replaceChildren();
	pendingDonationsList.replaceChildren();
	developerFeedbackList.replaceChildren();
}

loginForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	adminToken = tokenInput.value;
	await loadPending();
	if (!pendingSection.hidden) tokenInput.value = '';
});

document.querySelector('#refresh-pending').addEventListener('click', loadPending);
logoutButton.addEventListener('click', () => {
	lockReview();
	feedback.textContent = 'Review page locked.';
});

pendingList.addEventListener('click', async (event) => {
	const button = event.target.closest('[data-decision]');
	if (!button) return;
	const card = button.closest('[data-profile-id]');
	const profileId = card.dataset.profileId;
	button.disabled = true;
	feedback.textContent = button.dataset.decision === 'approved' ? 'Approving profile…' : 'Rejecting profile…';
	try {
		await adminRequest(`/barbers/${profileId}/decision`, {
			method: 'POST',
			body: JSON.stringify({ status: button.dataset.decision })
		});
		await loadPending();
	} catch (error) {
		feedback.textContent = error.message;
		button.disabled = false;
	}
});

pendingDonationsList.addEventListener('click', async (event) => {
	const button = event.target.closest('[data-donation-decision]');
	if (!button) return;
	const card = button.closest('[data-donation-id]');
	button.disabled = true;
	feedback.textContent = button.dataset.donationDecision === 'paid' ? 'Confirming Wave receipt…' : 'Rejecting Wave claim…';
	try {
		await adminRequest(`/donations/${card.dataset.donationId}/decision`, {
			method: 'POST',
			body: JSON.stringify({ status: button.dataset.donationDecision })
		});

		developerFeedbackList.addEventListener('click', async (event) => {
			const button = event.target.closest('[data-feedback-status]');
			if (!button) return;
			const card = button.closest('[data-feedback-id]');
			button.disabled = true;
			feedback.textContent = button.dataset.feedbackStatus === 'reviewed' ? 'Marking feedback as reviewed…' : 'Reopening feedback…';
			try {
				await adminRequest(`/feedback/${card.dataset.feedbackId}/decision`, {
					method: 'POST',
					body: JSON.stringify({ status: button.dataset.feedbackStatus })
				});
				await loadPending();
			} catch (error) {
				feedback.textContent = error.message;
				button.disabled = false;
			}
		});
		await loadPending();
	} catch (error) {
		feedback.textContent = error.message;
		button.disabled = false;
	}
});
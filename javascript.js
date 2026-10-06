const API = '/api';
const logoImage = '/goodcut-logo.svg';

const grid = document.querySelector('#barber-grid');
let barbers = [];
let activeFilter = 'all';
let activeQuery = '';

async function request(path, options = {}) {
	const response = await fetch(`${API}${path}`, {
		...options,
		headers: { 'Content-Type': 'application/json', ...options.headers }
	});
	const payload = await response.json();
	if (!response.ok) throw new Error(payload.error || 'Something went wrong. Please try again.');
	return payload;
}
function escapeHtml(value = '') {
	return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function imageFor(barber) {
	return barber.imageUrl || logoImage;
}

function renderBarbers() {
	if (!grid) return;
	const sort = document.querySelector('#sort-select')?.value || 'rating';
	const filtered = barbers.filter((barber) => {
		const text = `${barber.name} ${barber.phone} ${barber.shopName || ''} ${barber.city} ${(barber.specialties || []).join(' ')} ${barber.bio || ''}`.toLowerCase();
		return text.includes(activeQuery) && (activeFilter === 'all' || (barber.specialties || []).some((item) => item.toLowerCase().includes(activeFilter)));
	});
	filtered.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : b.rating - a.rating || b.reviewCount - a.reviewCount);
	document.querySelector('#results-status').textContent = `${filtered.length} ${filtered.length === 1 ? 'barber' : 'barbers'} in the lineup`;
	document.querySelector('#empty-state').hidden = filtered.length > 0;
	grid.innerHTML = filtered.map((barber, index) => `
		<article class="barber-card" style="--card-order:${index}">
			<div class="barber-photo-wrap"><img class="barber-photo${barber.imageUrl ? '' : ' barber-photo-placeholder'}" src="${escapeHtml(imageFor(barber))}" alt="${barber.imageUrl ? `${escapeHtml(barber.name)}'s profile photo` : 'GoodCut logo'}" loading="lazy"><span class="photo-index">${String(index + 1).padStart(2, '0')}</span></div>
			<div class="barber-card-body"><div class="barber-title-line"><div><h3>${escapeHtml(barber.name)}</h3><p class="shop-name">${escapeHtml(barber.shopName || 'Independent barber')}</p></div><span class="rating"><span>★</span> ${barber.rating ? Number(barber.rating).toFixed(1) : 'New'}</span></div>
				<p class="barber-location"><span aria-hidden="true">⌖</span> ${escapeHtml(barber.city)} <span class="review-count">· ${barber.reviewCount} ${barber.reviewCount === 1 ? 'review' : 'reviews'}</span></p>
				<div class="specialty-list">${(barber.specialties || []).slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
			<div class="barber-card-footer">
				${barber.phone ? `<a class="phone-label" href="tel:${escapeHtml(barber.phone)}">${escapeHtml(barber.phone)}</a><a class="whatsapp-link" href="https://wa.me/${escapeHtml(barber.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}
				${barber.bookingUrl ? `<a class="booking-link" href="${escapeHtml(barber.bookingUrl)}" target="_blank" rel="noopener noreferrer">Book a cut <span aria-hidden="true">↗</span></a>` : ''}</div>
				<div class="barber-card-actions"><button class="review-button" type="button" data-view-reviews="${barber.id}">Reviews (${barber.reviewCount})</button><button class="review-button" type="button" data-review="${barber.id}">Write a review <span aria-hidden="true">↗</span></button></div>
			</div>
		</article>`).join('');
}

async function loadBarbers() {
	try {
		const data = await request('/barbers');
		barbers = data.barbers;
		renderBarbers();
	} catch (error) {
		document.querySelector('#results-status').textContent = 'Could not reach the GoodCut API. Start the local server with npm start.';
		document.querySelector('#empty-state').hidden = false;
	}
}

if (grid) {
	loadBarbers();
	request('/donations/summary').then((data) => {
		document.querySelector('#community-total').textContent = `D${Number(data.totals?.GMD ?? data.total).toFixed(0)} · $${Number(data.totals?.USD || 0).toFixed(0)}`;
	}).catch(() => {});

	document.querySelector('#search-form').addEventListener('submit', (event) => {
		event.preventDefault();
		activeQuery = document.querySelector('#search-input').value.trim().toLowerCase();
		renderBarbers();
		document.querySelector('#directory').scrollIntoView({ behavior: 'smooth' });
	});
	document.querySelector('#search-input').addEventListener('input', (event) => {
		activeQuery = event.target.value.trim().toLowerCase();
		renderBarbers();
	});
	document.querySelectorAll('.filter-chip').forEach((button) => button.addEventListener('click', () => {
		document.querySelector('.filter-chip.is-active')?.classList.remove('is-active');
		button.classList.add('is-active');
		activeFilter = button.dataset.filter;
		renderBarbers();
	}));
	document.querySelector('#sort-select').addEventListener('change', renderBarbers);
	grid.addEventListener('click', (event) => {
		const reviewsButton = event.target.closest('[data-view-reviews]');
		if (reviewsButton) {
			const barber = barbers.find((item) => String(item.id) === reviewsButton.dataset.viewReviews);
			if (!barber) return;
			const reviewsDialog = document.querySelector('#reviews-dialog');
			const reviewsList = document.querySelector('#reviews-list');
			document.querySelector('#reviews-title').textContent = `Reviews for ${barber.name}`;
			reviewsList.innerHTML = '<p class="reviews-loading">Loading reviews…</p>';
			document.querySelector('#write-review-from-list').dataset.review = barber.id;
			reviewsDialog.showModal();
			request(`/reviews?barberId=${barber.id}`).then(({ reviews }) => {
				reviewsList.innerHTML = reviews.length ? reviews.map((review) => `<article class="customer-review"><div class="customer-review-top"><strong>${escapeHtml(review.name)}</strong><span class="customer-review-rating">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span></div>${review.text ? `<p>${escapeHtml(review.text)}</p>` : '<p class="review-no-text">Left a rating without a comment.</p>'}</article>`).join('') : '<p class="reviews-loading">No reviews yet. You could be the first.</p>';
			}).catch((error) => { reviewsList.innerHTML = `<p class="reviews-loading">${escapeHtml(error.message)}</p>`; });
			return;
		}
		const button = event.target.closest('[data-review]');
		if (!button) return;
		const barber = barbers.find((item) => String(item.id) === button.dataset.review);
		if (!barber) return;
		document.querySelector('#review-barber-id').value = barber.id;
		document.querySelector('#reviewing-name').textContent = `For ${barber.name} · ${barber.city}`;
		document.querySelector('#review-feedback').textContent = '';
		document.querySelector('#review-dialog').showModal();
	});
	document.querySelector('.dialog-close').addEventListener('click', () => document.querySelector('#review-dialog').close());
	document.querySelector('#reviews-close').addEventListener('click', () => document.querySelector('#reviews-dialog').close());
	document.querySelector('#write-review-from-list').addEventListener('click', (event) => {
		document.querySelector('#reviews-dialog').close();
		document.querySelector(`#barber-grid [data-review="${event.currentTarget.dataset.review}"]`)?.click();
	});
	document.querySelectorAll('.rating-picker button').forEach((button) => button.addEventListener('click', () => {
		document.querySelector('#review-rating').value = button.dataset.rating;
		document.querySelectorAll('.rating-picker button').forEach((star) => star.classList.toggle('selected', Number(star.dataset.rating) <= Number(button.dataset.rating)));
	}));
	document.querySelector('#review-form').addEventListener('submit', async (event) => {
		event.preventDefault();
		const feedback = document.querySelector('#review-feedback');
		feedback.textContent = 'Sending your review…';
		try {
			await request('/reviews', { method: 'POST', body: JSON.stringify({ barberId: Number(document.querySelector('#review-barber-id').value), name: document.querySelector('#reviewer-name').value, rating: Number(document.querySelector('#review-rating').value), text: document.querySelector('#review-text').value }) });
			feedback.textContent = 'Review added. Thanks for passing it on.';
			await loadBarbers();
			setTimeout(() => document.querySelector('#review-dialog').close(), 900);
			event.target.reset();
			document.querySelector('#review-rating').value = '5';
			document.querySelectorAll('.rating-picker button').forEach((star) => star.classList.toggle('selected', true));
		} catch (error) { feedback.textContent = error.message; }
	});

	let selectedAmount = 10;
	document.querySelectorAll('.amount-option').forEach((button) => button.addEventListener('click', () => {
		selectedAmount = Number(button.dataset.amount);
		document.querySelector('#custom-amount').value = '';
		document.querySelector('.amount-option.is-selected')?.classList.remove('is-selected');
		button.classList.add('is-selected');
	}));
	document.querySelector('#custom-amount').addEventListener('input', () => {
		document.querySelector('.amount-option.is-selected')?.classList.remove('is-selected');
	});
	document.querySelector('#donation-form').addEventListener('submit', async (event) => {
		event.preventDefault();
		const feedback = document.querySelector('#donation-feedback');
		const amount = Number(document.querySelector('#custom-amount').value || selectedAmount);
		if (!Number.isInteger(amount) || amount < 1 || amount > 500) {
			feedback.textContent = 'Choose an amount from D1 to D500.';
			return;
		}
		const paymentUrl = new URL('payment.html', window.location.href);
		paymentUrl.searchParams.set('amount', String(amount));
		paymentUrl.searchParams.set('name', document.querySelector('#donor-name').value.trim());
		window.location.assign(paymentUrl);
	});
}
const barberForm = document.querySelector('#barber-form');
	if (barberForm) {
	const imageInput = document.querySelector('#barber-image');
	const imagePreview = document.querySelector('#barber-image-preview');
	const submitButton = barberForm.querySelector('[type="submit"]');
	const feedback = document.querySelector('#barber-feedback');
	let previewUrl = '';

	function readImage(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.addEventListener('load', () => resolve(reader.result));
			reader.addEventListener('error', () => reject(new Error('Could not read the selected image.')));
			reader.readAsDataURL(file);
		});
	}

	imageInput.addEventListener('change', () => {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = '';
		imagePreview.hidden = true;
		const file = imageInput.files[0];
		if (!file) return;
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
			feedback.textContent = 'Choose a JPEG, PNG, or WebP image up to 2 MB.';
			imageInput.value = '';
			return;
		}
		previewUrl = URL.createObjectURL(file);
		imagePreview.src = previewUrl;
		imagePreview.hidden = false;
		feedback.textContent = '';
	});

	barberForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		const form = new FormData(barberForm);
		const specialties = String(form.get('specialties') || '').split(',').map((item) => item.trim()).filter(Boolean);
		const imageFile = form.get('profilePhoto');
		feedback.textContent = 'Submitting your profile for review…';
		submitButton.disabled = true;
		try {
			const imageData = imageFile.size ? await readImage(imageFile) : '';
			await request('/barbers', {
				method: 'POST',
				body: JSON.stringify({
					name: form.get('name'),
					shopName: form.get('shopName'),
					city: form.get('city'),
					specialties,
					phone: form.get('phone'),
					bio: form.get('bio'),
					imageData,
					bookingUrl: form.get('bookingUrl'),
					website: form.get('website')
				})
			});
			barberForm.reset();
			if (previewUrl) URL.revokeObjectURL(previewUrl);
			previewUrl = '';
			imagePreview.hidden = true;
			imagePreview.removeAttribute('src');
			feedback.textContent = 'Profile submitted. It will appear after a GoodCut review.';
		} catch (error) {
			feedback.textContent = error.message;
			submitButton.disabled = false;
		}
	});
}

const developerFeedbackForm = document.querySelector('#feedback-form');
if (developerFeedbackForm) {
	const submitButton = developerFeedbackForm.querySelector('[type="submit"]');
	const status = document.querySelector('#feedback-status');
	developerFeedbackForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		const form = new FormData(developerFeedbackForm);
		submitButton.disabled = true;
		status.textContent = 'Sending your feedback…';
		try {
			const result = await request('/feedback', {
				method: 'POST',
				body: JSON.stringify({
					name: form.get('name'),
					email: form.get('email'),
					message: form.get('message'),
					website: form.get('website')
				})
			});
			developerFeedbackForm.reset();
			status.textContent = result.message;
			submitButton.disabled = false;
		} catch (error) {
			status.textContent = error.message;
			submitButton.disabled = false;
		}
	});
}

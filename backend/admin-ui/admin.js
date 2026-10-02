const state = { token: sessionStorage.getItem('nilam_admin_token') || '', categories: [], products: [] }
const loginView = document.querySelector('#login-view')
const appView = document.querySelector('#app-view')
const tokenInput = document.querySelector('#token-input')
const loginError = document.querySelector('#login-error')
const productDialog = document.querySelector('#product-dialog')
const productForm = document.querySelector('#product-form')

async function api(path, options = {}) {
  const response = await fetch('/api/admin' + path, {
    ...options,
    headers: { 'x-admin-token': state.token, 'content-type': 'application/json', ...(options.headers || {}) },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message || 'Request failed')
  }
  return response.json()
}

function rupiah(value) { return 'Rp ' + Number(value).toLocaleString('id-ID') }
function escapeHtml(value) { const item = document.createElement('span'); item.textContent = String(value); return item.innerHTML }
function setValue(selector, value) { document.querySelector(selector).value = value || '' }

function renderMetrics(data) {
  const cards = [['Net sales', rupiah(data.netSales)], ['Orders', data.orderCount], ['Catalogue', data.productCount], ['Low stock', data.lowStock]]
  document.querySelector('#overview').innerHTML = cards.map(([label, value]) => '<article class="metric"><span>' + label + '</span><strong>' + value + '</strong><small>Current environment</small></article>').join('')
}

function renderProducts(items) {
  state.products = items
  document.querySelector('#products-body').innerHTML = items.length
    ? items.map(item => '<tr><td>' + escapeHtml(item.name) + '<br><small>/' + escapeHtml(item.handle) + '</small></td><td>' + escapeHtml(item.category) + '</td><td><span class="status">' + escapeHtml(item.status) + '</span></td><td>' + item.stock + '</td><td><button class="edit-product" data-id="' + item.id + '">Edit</button></td></tr>').join('')
    : '<tr><td colspan="5">No products found.</td></tr>'
  document.querySelectorAll('.edit-product').forEach(button => button.addEventListener('click', () => openProductEditor(state.products.find(item => item.id === button.dataset.id))))
}

function renderInventory(items) {
  document.querySelector('#inventory-body').innerHTML = items.length ? items.map(item => '<tr><td>' + escapeHtml(item.product) + '</td><td>' + escapeHtml(item.variant) + '<br><small>' + escapeHtml(item.sku) + '</small></td><td><form class="stock-editor" data-variant="' + escapeHtml(item.id) + '"><input type="number" min="0" step="1" value="' + item.quantity + '" aria-label="Quantity for ' + escapeHtml(item.sku) + '"><button>Save</button></form></td><td></td></tr>').join('') : '<tr><td colspan="4">No inventory records found.</td></tr>'
  document.querySelectorAll('.stock-editor').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault()
    const button = form.querySelector('button')
    button.disabled = true
    try {
      await api('/inventory/' + form.dataset.variant, { method: 'PATCH', body: JSON.stringify({ quantity: Number(form.querySelector('input').value) }) })
      await Promise.all([loadInventory(), loadProducts()])
    } catch (error) { alert(error.message) } finally { button.disabled = false }
  }))
}

function renderCategories(items) {
  document.querySelector('#categories-body').innerHTML = items.length
    ? items.map(item => '<tr><td>' + escapeHtml(item.name) + '</td><td>/' + escapeHtml(item.handle) + '</td><td>' + item._count.products + '</td><td><button class="edit-category" data-id="' + item.id + '">Edit</button> <button class="delete-category secondary" data-id="' + item.id + '">Delete</button></td></tr>').join('')
    : '<tr><td colspan="4">No categories yet.</td></tr>'
  document.querySelectorAll('.edit-category').forEach(button => button.addEventListener('click', () => editCategory(state.categories.find(item => item.id === button.dataset.id))))
  document.querySelectorAll('.delete-category').forEach(button => button.addEventListener('click', () => deleteCategory(state.categories.find(item => item.id === button.dataset.id))))
}

async function loadCategories() {
  state.categories = await api('/categories')
  document.querySelector('#product-category').innerHTML = state.categories.map(category => '<option value="' + category.id + '">' + escapeHtml(category.name) + '</option>').join('')
  renderCategories(state.categories)
}
async function loadProducts(query = '') { renderProducts(await api('/products?q=' + encodeURIComponent(query))) }
async function loadInventory() { renderInventory(await api('/inventory')) }

function openProductEditor(product) {
  document.querySelector('#product-error').textContent = ''
  productForm.reset()
  setValue('#product-id', product?.id)
  setValue('#product-name', product?.name)
  setValue('#product-handle', product?.handle)
  setValue('#product-description', product?.description)
  setValue('#product-status', product?.status || 'DRAFT')
  if (product) {
    const category = state.categories.find(item => item.name === product.category)
    setValue('#product-category', category?.id)
  }
  document.querySelector('#product-dialog-title').textContent = product ? 'Edit product' : 'New product'
  document.querySelectorAll('.new-only').forEach(field => { field.hidden = Boolean(product); field.querySelectorAll('input').forEach(input => { input.required = !product && input.id !== 'product-image' }) })
  productDialog.showModal()
}

function editCategory(category) {
  setValue('#category-id', category.id)
  setValue('#category-name', category.name)
  setValue('#category-handle', category.handle)
  document.querySelector('#category-save').textContent = 'Save category'
  document.querySelector('#category-cancel').hidden = false
  document.querySelector('#category-name').focus()
}

function resetCategoryForm() {
  document.querySelector('#category-form').reset()
  setValue('#category-id', '')
  document.querySelector('#category-error').textContent = ''
  document.querySelector('#category-save').textContent = 'Add category'
  document.querySelector('#category-cancel').hidden = true
}

async function deleteCategory(category) {
  if (!confirm('Delete “' + category.name + '”? Categories with products cannot be deleted.')) return
  try {
    await api('/categories/' + category.id, { method: 'DELETE' })
    await loadCategories()
  } catch (error) { alert(error.message) }
}

async function openApp() {
  try {
    const [dashboard] = await Promise.all([api('/dashboard'), loadCategories(), loadProducts(), loadInventory()])
    renderMetrics(dashboard)
    loginView.hidden = true
    appView.hidden = false
    loginError.textContent = ''
  } catch (error) {
    sessionStorage.removeItem('nilam_admin_token')
    state.token = ''
    loginError.textContent = error.message === 'Admin API is not configured' ? 'Admin access is not configured in backend/.env.' : 'Invalid admin token.'
  }
}

document.querySelector('#login-form').addEventListener('submit', event => {
  event.preventDefault()
  state.token = tokenInput.value
  sessionStorage.setItem('nilam_admin_token', state.token)
  openApp()
})
document.querySelector('#sign-out').addEventListener('click', () => {
  sessionStorage.removeItem('nilam_admin_token')
  state.token = ''
  tokenInput.value = ''
  appView.hidden = true
  loginView.hidden = false
})
document.querySelector('#product-search').addEventListener('input', event => loadProducts(event.target.value).catch(error => alert(error.message)))
document.querySelector('#new-product').addEventListener('click', () => openProductEditor())
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => productDialog.close()))
document.querySelector('#category-cancel').addEventListener('click', resetCategoryForm)
document.querySelector('#category-form').addEventListener('submit', async event => {
  event.preventDefault()
  const id = document.querySelector('#category-id').value
  const button = document.querySelector('#category-save')
  button.disabled = true
  try {
    await api(id ? '/categories/' + id : '/categories', { method: id ? 'PATCH' : 'POST', body: JSON.stringify({ name: document.querySelector('#category-name').value, handle: document.querySelector('#category-handle').value }) })
    resetCategoryForm()
    await loadCategories()
  } catch (error) { document.querySelector('#category-error').textContent = error.message } finally { button.disabled = false }
})
productForm.addEventListener('submit', async event => {
  event.preventDefault()
  const id = document.querySelector('#product-id').value
  const payload = {
    name: document.querySelector('#product-name').value,
    handle: document.querySelector('#product-handle').value,
    categoryId: document.querySelector('#product-category').value,
    status: document.querySelector('#product-status').value,
    description: document.querySelector('#product-description').value,
    sku: document.querySelector('#product-sku').value,
    price: document.querySelector('#product-price').value,
    quantity: document.querySelector('#product-quantity').value,
    image: document.querySelector('#product-image').value,
  }
  const save = document.querySelector('#product-save')
  save.disabled = true
  try {
    await api(id ? '/products/' + id : '/products', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
    productDialog.close()
    await Promise.all([loadProducts(), loadInventory()])
  } catch (error) { document.querySelector('#product-error').textContent = error.message } finally { save.disabled = false }
})
if (state.token) { tokenInput.value = state.token; openApp() }

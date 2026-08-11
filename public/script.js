const baseUrl = 'http://localhost:3000';

const loginForm = document.getElementById("login-form");
const logoutButton = document.getElementById("logout-button");
const errorMessage = document.getElementById("error-message");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
      const response = (await fetch(`${baseUrl}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      }));

      if (response.status === 200) {
        const userData = await response.json();
        localStorage.setItem('token', userData.token);

        window.location.href = "/dashboard.html";
      } else if (response.status === 401) {
        errorMessage.textContent = "Invalid credentials. Please try again.";
      } else if (response.status === 500) {
        errorMessage.textContent = "Server error. Please try again later.";
      } else {
        errorMessage.textContent = "An unexpected error occurred.";
      }
    } catch (error) {
      errorMessage.textContent = "Network error. Please check your internet connection.";
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    localStorage.removeItem('token');
    window.location.href = "/index.html";
  });
}

const isAuthenticated = localStorage.getItem('token') !== null;

const getProducts = async () => {
  const response = await fetch(`${baseUrl}/products`);
  const products = await response.json();

  const targetDiv = document.getElementById("product-list");

  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
        <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Description</th>
            <th>Price</th>
            <th>Rating</th>
            <th>Thumbnail</th>
        </tr>
    </thead>
    <tbody>
        ${products.map(product => `
            <tr>
                <td>${product.id}</td>
                <td>${product.title}</td>
                <td>${product.description}</td>
                <td>$${product.price}</td>
                <td>${product.rating}</td>
                <td><img src="${product.thumbnail}" alt="${product.title}"></td>
            </tr>
        `).join('')}
    </tbody>
  `;

  // Append the table to the target <div>
  targetDiv.appendChild(table);
}

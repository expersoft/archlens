# API de Pedidos

- Id: `loja.pedidos`
- Tipo: application-component (perfil C4: container)
- Status: active
- Tecnologia: Java / Spring Boot

Carrinho, checkout e ciclo de vida do pedido

Pai: Plataforma de E-commerce (`loja`)

## Filhos

- Checkout Controller (`loja.pedidos.checkout`)
- Carrinho Service (`loja.pedidos.carrinho`)
- Pagamento Adapter (`loja.pedidos.pagamento`)
- Pedido Repository (`loja.pedidos.repo`)
- Publicador de Eventos (`loja.pedidos.eventos`)

## Relações de saída

### realization

- API de Pedidos realiza Consulta de Pedidos.
- API de Pedidos atende a Checkout < 2s (p95).

### serving

- API de Pedidos serve CRM. [REST]

## Relações de entrada

### realization

- pedidos-api.jar realiza API de Pedidos.

### serving

- PostgreSQL 16 (RDS) serve API de Pedidos.
- Redis (ElastiCache) serve API de Pedidos.
- Hospedagem de contêineres serve API de Pedidos.
- Mensageria serve API de Pedidos.

resource "aws_db_instance" "pedidos" {
  engine         = "postgres"
  engine_version = "16.3"
  instance_class = "db.t4g.medium"
  vpc_security_group_ids = [aws_security_group.db.id]
}

resource "aws_msk_cluster" "eventos" {
  cluster_name  = "eventos"
  kafka_version = "3.6.0"
}

resource "aws_security_group" "db" {
  name = "db-sg"
}

resource "aws_eks_cluster" "principal" {
  name = "principal"
  depends_on = [aws_msk_cluster.eventos]
}
